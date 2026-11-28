const { z } = require('zod');

exports.createSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) });