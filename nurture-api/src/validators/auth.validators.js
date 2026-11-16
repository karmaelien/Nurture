const { z } = require('zod');

const email = z.string().trim().toLowerCase().pipe(z.email());


exports.registerSchema = z.object({
  email: email,
  username: z.string().trim().min(1).max(50),
  password: z.string().min(8).max(72),
});

exports.loginSchema = z.object({
  email: email,
  password: z.string().min(1),
});