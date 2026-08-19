import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import * as dns from 'dns';
import * as nodemailerShared from 'nodemailer/lib/shared';

// Force Nodemailer to ignore IPv6 globally by removing IPv6 interfaces from its cached networkInterfaces.
// Nodemailer uses c-ares for resolve4/resolve6, checking if any interface supports IPv6.
// Filtering out IPv6 entries here forces it to fallback/resolve only IPv4.
const sharedAny = nodemailerShared as any;
if (sharedAny.networkInterfaces) {
  for (const key of Object.keys(sharedAny.networkInterfaces)) {
    sharedAny.networkInterfaces[key] = sharedAny.networkInterfaces[key].filter(
      (iface: any) => iface.family !== 'IPv6' && iface.family !== 6,
    );
  }
}

@Injectable()
export class EmailService implements OnModuleInit {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    const rawUser =
      this.configService.get<string>('MAIL_USER') ||
      this.configService.get<string>('GMAIL_USER') ||
      '';
    const rawPass =
      this.configService.get<string>('MAIL_PASS') ||
      this.configService.get<string>('GMAIL_APP_PASSWORD') ||
      '';

    const user = rawUser.trim();
    const pass = rawPass.replace(/["'\s]/g, '');

    const smtpOptions: SMTPTransport.Options = {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // port 587 uses STARTTLS
      requireTLS: true,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10000, // 10s connect timeout
      socketTimeout: 15000, // 15s socket timeout
    };

    // Cast only the dnsLookup property to satisfy user's instruction
    (smtpOptions as { dnsLookup?: any }).dnsLookup = (
      hostname: string,
      options: dns.LookupOneOptions,
      callback: (
        err: NodeJS.ErrnoException | null,
        address: string,
        family: number,
      ) => void,
    ) => {
      dns.lookup(hostname, { ...options, family: 4 }, callback);
    };

    this.transporter = nodemailer.createTransport(smtpOptions);
  }

  async onModuleInit() {
    this.logger.log('Testing SMTP connectivity at startup...');
    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verified successfully!');
    } catch (err: any) {
      this.logger.error(`SMTP connection verification failed: ${err.message}`);
    }
  }

  private getBaseTemplate(content: string, title: string) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>${title} | Turfzy</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; }
          body { 
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #0B0E14; 
            margin: 0; 
            padding: 0; 
            color: #E2E8F0;
            -webkit-font-smoothing: antialiased;
          }
          .email-wrapper {
            background-color: #0B0E14;
            padding: 36px 16px;
            width: 100%;
          }
          .email-card { 
            max-width: 580px; 
            margin: 0 auto; 
            background: #131823; 
            border-radius: 22px; 
            overflow: hidden; 
            border: 1px solid #222B3C;
            box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.6); 
          }
          .brand-header { 
            background: linear-gradient(180deg, #1A2234 0%, #131823 100%); 
            padding: 30px 28px 22px; 
            text-align: center; 
            border-bottom: 1px solid #222B3C;
          }
          .brand-name { 
            margin: 0; 
            font-size: 28px; 
            font-weight: 900;
            letter-spacing: 2px;
            color: #7CFC00;
          }
          .brand-tagline {
            margin: 6px 0 0;
            font-size: 11px;
            color: #94A3B8;
            font-weight: 700;
            letter-spacing: 1.5px;
            text-transform: uppercase;
          }
          .email-body { 
            padding: 32px 28px; 
          }
          .hero-title { 
            font-size: 22px; 
            font-weight: 800; 
            color: #FFFFFF; 
            margin: 0 0 10px;
            text-align: center;
            letter-spacing: -0.02em;
          }
          .hero-sub {
            text-align: center;
            color: #94A3B8;
            font-size: 14.5px;
            line-height: 1.6;
            margin: 0 0 24px;
          }
          .receipt-box { 
            background: #181F2E; 
            border: 1px solid #26334A;
            border-radius: 16px; 
            padding: 20px; 
            margin: 20px 0; 
          }
          .receipt-table {
            width: 100%;
            border-collapse: collapse;
          }
          .receipt-row td {
            padding: 11px 0;
            border-bottom: 1px solid #222B3C;
            vertical-align: middle;
          }
          .receipt-row:last-child td { 
            border-bottom: none; 
          }
          .receipt-label { 
            color: #94A3B8; 
            font-size: 13px; 
            font-weight: 500; 
            width: 40%;
            text-align: left;
          }
          .receipt-value { 
            color: #FFFFFF; 
            font-size: 14px; 
            font-weight: 700; 
            width: 60%;
            text-align: right;
          }
          .pass-box {
            text-align: center;
            background: rgba(124, 252, 0, 0.04);
            border: 1.5px dashed rgba(124, 252, 0, 0.35);
            border-radius: 16px;
            padding: 22px 18px;
            margin: 24px 0;
          }
          .pass-label {
            color: #94A3B8;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1.2px;
          }
          .pass-code {
            font-size: 26px;
            font-weight: 900;
            letter-spacing: 1.5px;
            color: #7CFC00;
            margin: 8px 0;
            line-height: 1.2;
          }
          .pass-hint {
            font-size: 12px;
            color: #94A3B8;
            margin: 0;
            line-height: 1.5;
          }
          .cta-btn { 
            display: block; 
            padding: 15px 24px; 
            background: linear-gradient(135deg, #7CFC00 0%, #6FC000 100%); 
            color: #000000 !important; 
            text-decoration: none; 
            border-radius: 14px; 
            font-weight: 800; 
            text-align: center;
            margin-top: 28px;
            font-size: 15px;
            letter-spacing: 0.3px;
            box-shadow: 0 6px 20px -4px rgba(124, 252, 0, 0.35);
          }
          .badge-pill { 
            display: inline-block; 
            padding: 4px 10px; 
            border-radius: 6px; 
            font-size: 11px; 
            font-weight: 800; 
            letter-spacing: 0.5px;
            text-transform: uppercase; 
          }
          .badge-success { 
            background: rgba(124, 252, 0, 0.15); 
            color: #7CFC00; 
            border: 1px solid rgba(124, 252, 0, 0.3);
          }
          .badge-pending { 
            background: rgba(255, 184, 0, 0.15); 
            color: #FFB800; 
            border: 1px solid rgba(255, 184, 0, 0.3);
          }
          .badge-danger { 
            background: rgba(255, 69, 58, 0.15); 
            color: #FF453A; 
            border: 1px solid rgba(255, 69, 58, 0.3);
          }
          .brand-footer { 
            padding: 26px 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #64748B;
            background: #0E121B;
            border-top: 1px solid #1E293B;
          }
          .brand-footer p { margin: 4px 0; }
          .footer-links { margin-top: 14px; }
          .footer-link {
            color: #94A3B8;
            text-decoration: none;
            margin: 0 10px;
            font-weight: 600;
            font-size: 12px;
          }
          @media only screen and (max-width: 480px) {
            .email-wrapper { padding: 12px 6px; }
            .email-card { border-radius: 16px; }
            .email-body { padding: 22px 16px; }
            .hero-title { font-size: 20px; }
            .pass-code { font-size: 22px; }
          }
        </style>
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-card">
            <div class="brand-header">
              <h1 class="brand-name">TURFZY</h1>
              <p class="brand-tagline">${title}</p>
            </div>
            <div class="email-body">
              ${content}
            </div>
            <div class="brand-footer">
              <p style="font-weight: 700; color: #94A3B8;">TURFZY - Play More. Anywhere.</p>
              <p>&copy; 2026 Turfzy. All rights reserved.</p>
              <div class="footer-links">
                <a href="https://turfzy.com" class="footer-link">Website</a>
                <a href="mailto:turfzy2026@gmail.com" class="footer-link">Support</a>
                <a href="https://turfzy.com/privacy" class="footer-link">Privacy</a>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async sendBookingConfirmation(email: string, bookingData: any) {
    const {
      id,
      turfName,
      date,
      startTime,
      endTime,
      amount,
      paymentStatus,
      displayId,
    } = bookingData;

    const bookingRef = displayId || `#TRF-${id.slice(0, 7).toUpperCase()}`;

    const content = `
      <div class="hero-title">Booking Confirmed</div>
      <p class="hero-sub">Your pitch booking at <strong>${turfName}</strong> has been secured. Details and check-in pass are provided below.</p>
      
      <div class="receipt-box">
        <table class="receipt-table">
          <tr class="receipt-row">
            <td class="receipt-label">Booking ID</td> 
            <td class="receipt-value" style="color: #7CFC00;">${bookingRef}</td>
          </tr>
          <tr class="receipt-row">
            <td class="receipt-label">Venue</td> 
            <td class="receipt-value">${turfName}</td>
          </tr>
          <tr class="receipt-row">
            <td class="receipt-label">Match Date</td> 
            <td class="receipt-value">${date}</td>
          </tr>
          <tr class="receipt-row">
            <td class="receipt-label">Time Slot</td> 
            <td class="receipt-value">${startTime} - ${endTime}</td>
          </tr>
          <tr class="receipt-row">
            <td class="receipt-label">Payment Status</td> 
            <td class="receipt-value">
              <span class="badge-pill ${paymentStatus === 'SUCCESS' || paymentStatus === 'PAID' ? 'badge-success' : 'badge-pending'}">
                ${paymentStatus === 'SUCCESS' ? 'PAID & CONFIRMED' : paymentStatus}
              </span>
            </td>
          </tr>
          <tr class="receipt-row">
            <td class="receipt-label">Total Amount</td> 
            <td class="receipt-value" style="font-size: 16px;">Rs. ${amount}</td>
          </tr>
        </table>
      </div>

      <div class="pass-box">
        <div class="pass-label">Entry Pass Reference</div>
        <div class="pass-code">${bookingRef}</div>
        <p class="pass-hint">Present your dynamic QR code from the Turfzy app at the venue gate (active 10 minutes prior to slot start).</p>
      </div>
      
      <a href="https://turfzy.com" class="cta-btn">View in Turfzy App</a>
    `;

    const plainText = `TURFZY - Booking Confirmed\n\nYour booking at ${turfName} is confirmed.\n\nBooking ID: ${bookingRef}\nVenue: ${turfName}\nDate: ${date}\nTime Slot: ${startTime} - ${endTime}\nPayment Status: ${paymentStatus}\nTotal Amount: Rs. ${amount}\n\nPresent your dynamic QR code in the Turfzy app at the venue gate.\n\nThank you for choosing Turfzy!`;

    return this.sendMail(
      email,
      `Booking Confirmed - ${turfName} (${bookingRef})`,
      this.getBaseTemplate(content, 'Official Booking Receipt'),
      plainText,
    );
  }

  async sendBookingCancellation(email: string, bookingData: any) {
    const { turfName, date, startTime, amount, refundAmount, reason } =
      bookingData;

    const content = `
      <div class="hero-title" style="color: #94A3B8;">Booking Cancelled</div>
      <p class="hero-sub">Your booking for <strong>${turfName}</strong> has been cancelled.</p>
      
      <div class="receipt-box">
        <table class="receipt-table">
          <tr class="receipt-row">
            <td class="receipt-label">Venue</td> 
            <td class="receipt-value">${turfName}</td>
          </tr>
          <tr class="receipt-row">
            <td class="receipt-label">Date & Time</td> 
            <td class="receipt-value">${date} at ${startTime}</td>
          </tr>
          <tr class="receipt-row">
            <td class="receipt-label">Reason</td> 
            <td class="receipt-value">${reason || 'Customer Request'}</td>
          </tr>
          <tr class="receipt-row">
            <td class="receipt-label">Refund Initiated</td> 
            <td class="receipt-value" style="color: #7CFC00;">Rs. ${refundAmount || 0}</td>
          </tr>
        </table>
      </div>
      
      <p style="font-size: 13px; color: #94A3B8; text-align: center; margin-top: 20px; line-height: 1.5;">
        Eligible refunds are processed to your original payment method within 5-7 business days.
      </p>
      <a href="https://turfzy.com" class="cta-btn" style="background: #334155; color: #FFFFFF !important;">Book Another Slot</a>
    `;

    const plainText = `TURFZY - Booking Cancelled\n\nYour booking for ${turfName} on ${date} at ${startTime} has been cancelled.\nRefund Initiated: Rs. ${refundAmount || 0}\nReason: ${reason || 'Customer Request'}\n\nThank you,\nTurfzy Team`;

    return this.sendMail(
      email,
      `Cancellation Confirmed - ${turfName}`,
      this.getBaseTemplate(content, 'Cancellation Notice'),
      plainText,
    );
  }

  async sendPaymentPending(email: string, bookingData: any) {
    const { turfName, amount, expiryTime } = bookingData;

    const content = `
      <div class="hero-title">Payment Pending</div>
      <p class="hero-sub">Your slot at <strong>${turfName}</strong> is reserved. Complete payment to secure your booking before the reservation expires.</p>
      
      <div class="receipt-box">
        <table class="receipt-table">
          <tr class="receipt-row">
            <td class="receipt-label">Venue</td> 
            <td class="receipt-value">${turfName}</td>
          </tr>
          <tr class="receipt-row">
            <td class="receipt-label">Payable Amount</td> 
            <td class="receipt-value">Rs. ${amount}</td>
          </tr>
          <tr class="receipt-row">
            <td class="receipt-label">Expires At</td> 
            <td class="receipt-value" style="color: #FF453A;">${expiryTime}</td>
          </tr>
        </table>
      </div>
      
      <a href="https://turfzy.com" class="cta-btn">Complete Payment Now</a>
    `;

    const plainText = `TURFZY - Payment Pending\n\nYour session at ${turfName} is reserved for Rs. ${amount}.\nComplete your payment before ${expiryTime} to confirm your slot.\n\nTurfzy Team`;

    return this.sendMail(
      email,
      `Payment Pending - ${turfName}`,
      this.getBaseTemplate(content, 'Payment Reminder'),
      plainText,
    );
  }

  async sendNoShowNotice(email: string, bookingData: any) {
    const { turfName, date, startTime } = bookingData;

    const content = `
      <div class="hero-title" style="color: #FF453A;">Missed Booking Notice</div>
      <p class="hero-sub">The venue <strong>${turfName}</strong> noted you were unable to check in for your booking on ${date} at ${startTime}.</p>
      
      <div class="receipt-box" style="border-left: 4px solid #FF453A;">
        <table class="receipt-table">
          <tr class="receipt-row">
            <td class="receipt-label">Venue</td> 
            <td class="receipt-value">${turfName}</td>
          </tr>
          <tr class="receipt-row">
            <td class="receipt-label">Date & Time</td> 
            <td class="receipt-value">${date} at ${startTime}</td>
          </tr>
          <tr class="receipt-row">
            <td class="receipt-label">Status</td> 
            <td class="receipt-value"><span class="badge-pill badge-danger">No Show</span></td>
          </tr>
        </table>
      </div>
      
      <p style="font-size: 13px; text-align: center; color: #94A3B8; margin-top: 20px;">
        No-shows are non-refundable. We look forward to hosting you on your next match.
      </p>
      <a href="https://turfzy.com" class="cta-btn">Book Another Slot</a>
    `;

    const plainText = `TURFZY - Missed Booking\n\nYou did not check in for your booking at ${turfName} on ${date} at ${startTime}.\nStatus: No Show\n\nTurfzy Team`;

    return this.sendMail(
      email,
      `Missed Booking Notice - ${turfName}`,
      this.getBaseTemplate(content, 'Attendance Notice'),
      plainText,
    );
  }

  private async sendMail(to: string, subject: string, html: string, text?: string) {
    const sender =
      (
        this.configService.get<string>('MAIL_USER') ||
        this.configService.get<string>('GMAIL_USER') ||
        'turfzy2026@gmail.com'
      ).trim();

    try {
      const info = await this.transporter.sendMail({
        from: `"Turfzy" <${sender}>`,
        to,
        replyTo: sender,
        subject,
        html,
        text,
      });
      this.logger.log(`[EMAIL_SENT] Successfully sent email to ${to}: ${info.messageId}`);
      return info;
    } catch (error: any) {
      this.logger.error(`[EMAIL_ERROR] Failed to send email to ${to}: ${error.message}`);
      throw error;
    }
  }
}
