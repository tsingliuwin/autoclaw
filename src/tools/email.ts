import nodemailer from 'nodemailer';
import { ToolModule } from './interface.js';

export const EmailTool: ToolModule = {
  name: "Email Service",
  configKeys: ["smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpFrom"],
  definition: {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email using configured SMTP settings. Can include optional file attachments.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address." },
          subject: { type: "string", description: "Email subject." },
          body: { type: "string", description: "Email body content (text)." },
          attachments: { 
            type: "array", 
            items: { type: "string" },
            description: "Optional list of local file paths to attach to the email."
          }
        },
        required: ["to", "subject", "body"]
      }
    }
  },
  handler: async (args: any, config: any) => {
    // Validate config
    if (!config?.smtpHost || !config?.smtpUser || !config?.smtpPass) {
      return "Error: Email tool is not configured. Please run 'autoclaw setup' to configure SMTP settings.";
    }

    try {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: parseInt(config.smtpPort || '587'),
        secure: parseInt(config.smtpPort) === 465, // true for 465, false for other ports
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
      });

      const emailAttachments = args.attachments?.map((filePath: string) => ({
        path: filePath
      })) || [];

      const info = await transporter.sendMail({
        from: config.smtpFrom || config.smtpUser, // sender address
        to: args.to, // list of receivers
        subject: args.subject, // Subject line
        text: args.body, // plain text body
        attachments: emailAttachments
      });

      return `Email sent successfully. Message ID: ${info.messageId}`;
    } catch (error: any) {
      // Return detailed error info for debugging
      const code = error.code ? `[Code: ${error.code}] ` : '';
      const response = error.response ? ` (Server Response: ${error.response})` : '';
      return `Failed to send email: ${code}${error.message}${response}`;
    }
  }
};
