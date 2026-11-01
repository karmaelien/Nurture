const { z } = require('zod');
const Dashboard = require('../models/dashboard.model');
const { httpError } = require('../utils/httpErrors');
const Member = require('../models/member.model');

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  budget: z.int().min(0).max(2147483647).optional(), // whole cents
});

const create = async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, 'VALIDATION_ERROR',
        'Provide a dashboard name, and optionally a budget as a whole number of cents.');
    }
    const { name, budget } = parsed.data;

const dashboard = await Dashboard.create({ name, budget: budget ?? null, createdBy: req.user.id });
await Member.create({ 
  dashboardId: dashboard.id, 
  userId: req.user.id, 
  displayName: req.user.username,
  role: 'owner'
 });
    res.status(201).json({ dashboard });
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const dashboards = await Dashboard.findByOccupancy(req.user.id);
    res.json({ dashboards });
  } catch (err) {
    next(err);
  }
};

const get = async (req, res, next) => {
  try {
    // requirePermission already confirmed membership and set req.dashboardId
    const dashboard = await Dashboard.findById(req.dashboardId);
    res.json({ dashboard: { ...dashboard, role: req.membership.role } });
  } catch (err) {
    next(err);
  }
};

module.exports = { create, list, get };