# Medications

The read-only page at `/app/medications` shows medications for the selected family.
It starts with all care profiles selected; the Care profile dropdown filters the list.
Each entry shows the medication name, person, dosage, daily schedule with its time zone,
and the assigned caregiver. Loading, retry, and empty states are included.

`GET /api/circles/:circleId/medications` currently has a browser mock only. It checks
family membership before returning sample medications for Rose and Frank. Other
families start empty. The shared types are in `client/src/api/types.ts`; schedule
times are `HH:mm` clock times in the schedule's IANA time zone. These definitions
are separate from individual dose occurrences shown on Home.

Creation, editing, dose completion, recurring schedule generation, reminders, and
the real backend are still to come. This page does not infer a medication's full
schedule from historical doses or generate new occurrences.
