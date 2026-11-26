const webpush = require('web-push');
const medicationModel = require('../models/medication.model');
const notificationModel = require('../models/medication-notification.model');

function pushConfig(env = process.env) {
  if (
    env.ENABLE_MEDICATIONS_API !== 'true' ||
    env.ENABLE_MEDICATION_PUSH !== 'true' ||
    !env.VAPID_PUBLIC_KEY ||
    !env.VAPID_PRIVATE_KEY ||
    !env.VAPID_SUBJECT
  )
    return null;
  return {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
}

/** Windows match the in-app reminder/grace settings. Missed alerts have a short catch-up window. */
function notificationKind(dose, now) {
  if (dose.status !== 'pending' || dose.medicationStoppedAt) return null;
  const scheduled = new Date(dose.scheduledAt).getTime();
  const missed = scheduled + dose.overdueAfterMinutes * 60_000;
  if (now >= missed) return now < missed + 5 * 60_000 ? 'missed' : null;
  return dose.reminderBeforeMinutes !== null &&
    dose.reminderBeforeMinutes !== undefined &&
    now >= scheduled - dose.reminderBeforeMinutes * 60_000
    ? 'reminder'
    : null;
}

async function deliver(db, subscriptionId, doseId, kind, config, send = webpush.sendNotification) {
  return notificationModel(db).withDelivery(subscriptionId, doseId, async (row, delivery) => {
    if (notificationKind(row, Date.now()) !== kind) return false;
    if (row.subscription.expirationTime && row.subscription.expirationTime <= Date.now()) {
      await delivery.remove();
      return false;
    }
    if (!(await delivery.claim(kind))) return false;
    try {
      // Lock-screen notifications deliberately omit medication names, profiles, and dosages.
      await send(
        row.subscription,
        JSON.stringify({
          title: kind === 'missed' ? 'Missed medication dose' : 'Medication reminder',
          body: 'Open Nurture to review your medications.',
          tag: `medication:${doseId}:${kind}`,
          url: `/app/medications?circleId=${encodeURIComponent(row.circleId)}`,
        }),
        { vapidDetails: config, TTL: 60, timeout: 5000, urgency: 'normal' },
      );
      return true;
    } catch (error) {
      if (![404, 410].includes(error.statusCode)) throw error; // Roll back the claim for a retry.
      await delivery.remove();
      return false;
    }
  });
}

async function tick(db, config, send = webpush.sendNotification) {
  const notifications = notificationModel(db);
  await notifications.pruneDeliveries();
  const families = await notifications.families();
  const model = medicationModel(db);
  for (const family of families) {
    try {
      const now = Date.now();
      const doses = await model.run(family.circleId, family.userId, (model) =>
        model.occurrences({
          from: new Date(now - 24 * 3_600_000 - 5 * 60_000).toISOString(),
          to: new Date(now + 24 * 3_600_000 + 1).toISOString(),
          status: 'pending',
        }),
      );
      for (const dose of doses) {
        const kind = notificationKind(dose, Date.now());
        if (!kind) continue;
        const subscriptions = await notifications.subscriptions(family.circleId);
        for (const subscription of subscriptions) {
          try {
            await deliver(db, subscription.id, dose.id, kind, config, send);
          } catch (error) {
            console.error(
              'Medication push service unavailable:',
              error.statusCode || error.code || 'unavailable',
            );
          }
        }
      }
    } catch (error) {
      // One family's removed membership or failed push must not prevent others from receiving reminders.
      console.error('Medication reminder delivery failed:', error.code || error.statusCode || 'unavailable');
    }
  }
}

function startMedicationPush(db) {
  const config = pushConfig();
  if (!config) return () => {};
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await tick(db, config);
    } catch (error) {
      console.error('Medication reminders unavailable:', error.code || 'unavailable');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void run(), 60_000);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}

module.exports = {
  pushConfig,
  notificationKind,
  deliver,
  tick,
  startMedicationPush,
};
