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
    const smtpOptions: SMTPTransport.Options = {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // port 587 uses STARTTLS
      requireTLS: true,
      auth: {
        user:
          this.configService.get<string>('MAIL_USER') ||
          this.configService.get<string>('GMAIL_USER'),
        pass:
          this.configService.get<string>('MAIL_PASS') ||
          this.configService.get<string>('GMAIL_APP_PASSWORD'),
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
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
        <style>
          body { 
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #f8fafc; 
            margin: 0; 
            padding: 0; 
            color: #1e293b;
            -webkit-font-smoothing: antialiased;
          }
          .wrapper {
            background-color: #f8fafc;
            padding: 40px 20px;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: #ffffff; 
            border-radius: 20px; 
            overflow: hidden; 
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); 
          }
          .header { 
            background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
            padding: 40px 30px; 
            text-align: center; 
            color: white; 
          }
          .header h1 { 
            margin: 0; 
            font-size: 32px; 
            font-weight: 700;
            letter-spacing: -0.025em;
          }
          .header p {
            margin: 10px 0 0;
            font-size: 16px;
            opacity: 0.9;
            font-weight: 400;
          }
          .logo-circle {
            width: 64px;
            height: 64px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            backdrop-filter: blur(4px);
          }
          .content { padding: 40px 30px; }
          .hero-text { 
            font-size: 22px; 
            font-weight: 600; 
            color: #0f172a; 
            margin-bottom: 24px;
            text-align: center;
          }
          .info-card { 
            background: #f8fafc; 
            border: 1px solid #e2e8f0;
            border-radius: 16px; 
            padding: 20px; 
            margin: 24px 0; 
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
          }
          .info-row td {
            padding: 10px 0;
            border-bottom: 1px solid #f1f5f9;
            vertical-align: middle;
          }
          .info-row:last-child td { border-bottom: none; }
          .info-label { 
            color: #64748b; 
            font-size: 13px; 
            font-weight: 500; 
            width: 40%;
            text-align: left;
          }
          .info-value { 
            color: #0f172a; 
            font-size: 14px; 
            font-weight: 600; 
            width: 60%;
            text-align: right;
          }
          
          .pin-container {
            text-align: center;
            background: #ffffff;
            border: 2px dashed #cbd5e1;
            border-radius: 16px;
            padding: 24px;
            margin: 24px 0;
          }
          .pin-code {
            font-size: 42px;
            font-weight: 800;
            letter-spacing: 0.15em;
            color: #10b981;
            margin: 8px 0;
            line-height: 1;
          }
          
          .footer { 
            padding: 30px; 
            text-align: center; 
            font-size: 13px; 
            color: #94a3b8;
            background: #f8fafc;
          }
          .footer p { margin: 4px 0; }
          .social-links { margin-top: 20px; }
          .social-link {
            color: #64748b;
            text-decoration: none;
            margin: 0 8px;
            font-weight: 500;
          }
          
          .btn { 
            display: block; 
            padding: 16px 20px; 
            background: #10b981; 
            color: #ffffff !important; 
            text-decoration: none; 
            border-radius: 12px; 
            font-weight: 600; 
            text-align: center;
            margin-top: 32px;
            font-size: 16px;
            box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);
          }
          .badge { 
            display: inline-block; 
            padding: 4px 10px; 
            border-radius: 6px; 
            font-size: 11px; 
            font-weight: 700; 
            text-transform: uppercase; 
          }
          .badge-success { background: #dcfce7; color: #166534; }
          .badge-pending { background: #fef9c3; color: #854d0e; }
          .badge-danger { background: #fee2e2; color: #991b1b; }
          
          @media only screen and (max-width: 480px) {
            .container { border-radius: 0; }
            .wrapper { padding: 0; }
            .content { padding: 30px 20px; }
            .pin-code { font-size: 32px; }
            .hero-text { font-size: 18px; }
            .info-label { font-size: 12px; }
            .info-value { font-size: 13px; }
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              <div class="logo-circle">🏟️</div>
              <h1>Turfsy</h1>
              <p>${title}</p>
            </div>
            <div class="content">
              ${content}
            </div>
            <div class="footer">
              <p>Made with ❤️ for Sports Lovers</p>
              <p>&copy; 2026 Turfsy. All rights reserved.</p>
              <div class="social-links">
                <a href="#" class="social-link">Instagram</a>
                <a href="#" class="social-link">Twitter</a>
                <a href="#" class="social-link">Support</a>
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
      pin,
    } = bookingData;

    const content = `
      <div class="hero-text">Your Stadium is Ready! ⚽</div>
      <p style="text-align: center; color: #64748b; font-size: 15px;">Hey champion! Your booking at <strong>${turfName}</strong> is confirmed. It's time to lace up and hit the pitch.</p>
      
      <div class="info-card">
        <table class="info-table">
          <tr class="info-row"><td class="info-label">Booking ID</td> <td class="info-value">#${id.slice(0, 8).toUpperCase()}</td></tr>
          <tr class="info-row"><td class="info-label">Date</td> <td class="info-value">${date}</td></tr>
          <tr class="info-row"><td class="info-label">Time Slot</td> <td class="info-value">${startTime} – ${endTime}</td></tr>
          <tr class="info-row"><td class="info-label">Payment</td> <td class="info-value"><span class="badge ${paymentStatus === 'SUCCESS' ? 'badge-success' : 'badge-pending'}">${paymentStatus}</span></td></tr>
          <tr class="info-row"><td class="info-label">Total Amount</td> <td class="info-value">₹${amount}</td></tr>
        </table>
      </div>

      <div class="pin-container">
        <div style="color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Your Check-In PIN</div>
        <div class="pin-code">${pin || '0000'}</div>
        <p style="font-size: 13px; color: #94a3b8; margin: 0;">Show this code at the turf entrance</p>
      </div>
      
      <a href="#" class="btn">Manage Booking</a>
    `;

    return this.sendMail(
      email,
      `Booking Confirmed - ${turfName}`,
      this.getBaseTemplate(content, 'Booking Summary'),
    );
  }

  async sendBookingCancellation(email: string, bookingData: any) {
    const { turfName, date, startTime, amount, refundAmount, reason } =
      bookingData;

    const content = `
      <div class="hero-text" style="color: #64748b;">Booking Cancelled</div>
      <p style="text-align: center; color: #64748b; font-size: 15px;">We're sorry to hear you won't be making it. Your booking for <strong>${turfName}</strong> has been cancelled.</p>
      
      <div class="info-card">
        <table class="info-table">
          <tr class="info-row"><td class="info-label">Venue</td> <td class="info-value">${turfName}</td></tr>
          <tr class="info-row"><td class="info-label">Date/Time</td> <td class="info-value">${date} at ${startTime}</td></tr>
          <tr class="info-row"><td class="info-label">Reason</td> <td class="info-value">${reason || 'User Request'}</td></tr>
          <tr class="info-row"><td class="info-label">Refund Initiated</td> <td class="info-value" style="color: #10b981;">₹${refundAmount || 0}</td></tr>
        </table>
      </div>
      
      <p style="font-size: 13px; color: #94a3b8; text-align: center; margin-top: 20px;">Refunds usually reflect in your account within 5-7 business days.</p>
      <a href="#" class="btn" style="background: #64748b;">Book Another Turf</a>
    `;

    return this.sendMail(
      email,
      `Cancellation Confirmed - ${turfName}`,
      this.getBaseTemplate(content, 'Cancellation Details'),
    );
  }

  async sendPaymentPending(email: string, bookingData: any) {
    const { turfName, amount, expiryTime } = bookingData;

    const content = `
      <div class="hero-text">Don't Lose Your Slot! ⏳</div>
      <p style="text-align: center; color: #64748b; font-size: 15px;">Your session at <strong>${turfName}</strong> is reserved. Complete payment to secure your time before it expires.</p>
      
      <div class="info-card">
        <table class="info-table">
          <tr class="info-row"><td class="info-label">Venue</td> <td class="info-value">${turfName}</td></tr>
          <tr class="info-row"><td class="info-label">Payable Amount</td> <td class="info-value">₹${amount}</td></tr>
          <tr class="info-row"><td class="info-label">Expires At</td> <td class="info-value" style="color: #ef4444;">${expiryTime}</td></tr>
        </table>
      </div>
      
      <a href="#" class="btn">Complete Payment</a>
    `;

    return this.sendMail(
      email,
      `Flash Notice: Payment Pending - ${turfName}`,
      this.getBaseTemplate(content, 'Action Required'),
    );
  }

  async sendNoShowNotice(email: string, bookingData: any) {
    const { turfName, date, startTime } = bookingData;

    const content = `
      <div class="hero-text" style="color: #ef4444;">We Missed You! 🏟️</div>
      <p style="text-align: center; color: #64748b; font-size: 15px;">Our team at <strong>${turfName}</strong> noticed you didn't check in for your booking today at ${startTime}.</p>
      
      <div class="info-card" style="border-left: 4px solid #ef4444;">
        <table class="info-table">
          <tr class="info-row"><td class="info-label">Date</td> <td class="info-value">${date}</td></tr>
          <tr class="info-row"><td class="info-label">Status</td> <td class="info-value"><span class="badge badge-danger">No Show</span></td></tr>
        </table>
      </div>
      
      <p style="font-size: 13px; text-align: center; color: #94a3b8; margin-top: 20px;">No-shows are non-refundable, but we hope to see you back on the field soon!</p>
      <a href="#" class="btn">Book for Tomorrow</a>
    `;

    return this.sendMail(
      email,
      `Missed Booking - ${turfName}`,
      this.getBaseTemplate(content, 'Attendance Update'),
    );
  }

  private async sendMail(to: string, subject: string, html: string) {
    try {
      const info = await this.transporter.sendMail({
        from: `"Turfsy" <${this.configService.get<string>('MAIL_USER')}>`,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent: ${info.messageId}`);
      return info;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      throw error;
    }
  }
}
