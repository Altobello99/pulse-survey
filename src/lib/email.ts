import nodemailer from "nodemailer";
import { prisma } from "./prisma";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.example.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

const FROM = process.env.SMTP_FROM || "Employee Pulse Survey <noreply@pulsesurvey.com>";

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  category: string
) {
  const log = await prisma.emailLog.create({
    data: { recipient: to, subject, body: html, category, status: "pending" },
  });

  // Skip actual sending if SMTP is not configured
  if (!process.env.SMTP_HOST) {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: "skipped", errorMsg: "SMTP not configured" },
    });
    return { sent: false, reason: "SMTP not configured" };
  }

  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: "sent", sentAt: new Date() },
    });
    return { sent: true };
  } catch (err: any) {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: "failed", errorMsg: err.message },
    });
    return { sent: false, reason: err.message };
  }
}

export function surveyReminderHtml(surveyTitle: string, surveyUrl: string) {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #0d9488;">Employee Pulse Survey</h2>
      </div>
      <p>Hi there,</p>
      <p>You have a pending survey: <strong>${surveyTitle}</strong></p>
      <p>Your response is completely confidential and helps us improve the workplace for everyone.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${surveyUrl}" style="background-color: #0d9488; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Take Survey</a>
      </div>
      <p style="color: #94a3b8; font-size: 12px;">This survey is anonymous. Your answers are never linked to your identity.</p>
    </div>
  `;
}

export function managerInsightHtml(managerName: string, surveyTitle: string, dashboardUrl: string, summary: string) {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #0d9488;">Employee Pulse Survey</h2>
      </div>
      <p>Hi ${managerName},</p>
      <p>New insights are available for <strong>${surveyTitle}</strong>.</p>
      <p style="background: #f8fafc; padding: 16px; border-radius: 8px; border-left: 4px solid #0d9488;">${summary}</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${dashboardUrl}" style="background-color: #0d9488; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">View Dashboard</a>
      </div>
    </div>
  `;
}
