const { z } = require('zod');

const email = z.string().trim().toLowerCase().pipe(z.email());


exports.registerSchema = z.object({
  email: email,
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128),
});

exports.loginSchema = z.object({
  email: email,
  password: z.string().min(1),
});