
import nodemailer from 'nodemailer';

const transports = new WeakMap();

function getTransport(config) {
  const { host, port, user, password, from } = config.smtp;

  if (!host || !user || !password || !from) {
    throw new Error('SMTP is not configured');
  }

  let transport = transports.get(config);

  if (!transport) {
    transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass: password,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

    transports.set(config, transport);
  }

  return transport;
}

export async function sendRegistrationOtp(config, email, code) {
  const transport = getTransport(config);

  await transport.sendMail({
    from: config.smtp.from,
    to: email,
    subject: 'Your CampusPages verification code',
    text: `Your CampusPages verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
  });
}

export async function sendPasswordResetOtp(config, email, code) {
  const transport = getTransport(config);

  await transport.sendMail({
    from: config.smtp.from,
    to: email,
    subject: 'Reset your CampusPages password',
    text: `Your CampusPages password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
  });
}
