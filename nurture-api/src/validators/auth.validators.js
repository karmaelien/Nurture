const { z } = require('zod');

exports.registerSchema = z.object({
  email: z.email(),
  username: z.string().trim().min(1).max(50),
  password: z.string().min(8).max(72),
});

exports.loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});