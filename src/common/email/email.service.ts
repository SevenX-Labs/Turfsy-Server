import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
    });
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
            background: #f1f5f9; 
            border-radius: 16px; 
            padding: 24px; 
            margin: 24px 0; 
          }
          .info-row { 
            display: flex; 
            justify-content: space-between; 
            padding: 12px 0; 
            border-bottom: 1px solid rgba(0,0,0,0.05); 
          }
          .info-row:last-child { border-bottom: none; }
          .info-label { color: #64748b; font-size: 14px; font-weight: 500; }
          .info-value { color: #1e293b; font-size: 15px; font-weight: 600; text-align: right; }
          
          .pin-container {
            text-align: center;
            background: #ffffff;
            border: 2px dashed #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
          }
          .pin-code {
            font-size: 36px;
            font-weight: 700;
            letter-spacing: 0.2em;
            color: #10b981;
            margin: 10px 0;
          }
          
          .footer { 
            padding: 30px; 
            text-align: center; 
            font-size: 14px; 
            color: #94a3b8;
            background: #f8fafc;
          }
          .footer p { margin: 5px 0; }
          .social-links { margin-top: 20px; }
          .social-link {
            color: #94a3b8;
            text-decoration: none;
            margin: 0 10px;
          }
          
          .btn { 
            display: block; 
            padding: 16px 24px; 
            background: #10b981; 
            color: #ffffff !important; 
            text-decoration: none; 
            border-radius: 12px; 
            font-weight: 600; 
            text-align: center;
            margin-top: 30px;
            transition: background 0.2s;
            box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);
          }
          .badge { 
            display: inline-block; 
            padding: 4px 10px; 
            border-radius: 8px; 
            font-size: 12px; 
            font-weight: 700; 
            text-transform: uppercase; 
          }
          .badge-success { background: #dcfce7; color: #166534; }
          .badge-pending { background: #fef9c3; color: #854d0e; }
          .badge-danger { background: #fee2e2; color: #991b1b; }
          
          @media only screen and (max-width: 600px) {
            .container { border-radius: 0; }
            .wrapper { padding: 0; }
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
    const { id, turfName, date, startTime, endTime, amount, paymentStatus, pin } = bookingData;
    
    const content = `
      <div class="hero-text">Your Stadium is Ready! ⚽</div>
      <p>Hey champion! Your booking at <strong>${turfName}</strong> is confirmed. It's time to lace up and hit the pitch.</p>
      
      <div class="info-card">
        <div class="info-row"><span class="info-label">Booking ID</span> <span class="info-value">#${id.slice(0, 8).toUpperCase()}</span></div>
        <div class="info-row"><span class="info-label">Date</span> <span class="info-value">${date}</span></div>
        <div class="info-row"><span class="info-label">Time Slot</span> <span class="info-value">${startTime} – ${endTime}</span></div>
        <div class="info-row"><span class="info-label">Payment</span> <span class="info-value"><span class="badge ${paymentStatus === 'SUCCESS' ? 'badge-success' : 'badge-pending'}">${paymentStatus}</span></span></div>
        <div class="info-row"><span class="info-label">Total Paid</span> <span class="info-value">₹${amount}</span></div>
      </div>

      <div class="pin-container">
        <div class="info-label">YOUR CHECK-IN PIN</div>
        <div class="pin-code">${pin || '0000'}</div>
        <p style="font-size: 13px; color: #64748b; margin: 0;">Show this at the turf to start your session</p>
      </div>
      
      <a href="#" class="btn">Manage My Booking</a>
    `;

    return this.sendMail(email, `Booking Confirmed - ${turfName}`, this.getBaseTemplate(content, 'Booking Summary'));
  }

  async sendBookingCancellation(email: string, bookingData: any) {
    const { turfName, date, startTime, amount, refundAmount, reason } = bookingData;

    const content = `
      <div class="hero-text" style="color: #64748b;">Booking Cancelled</div>
      <p>We're sorry to hear you won't be making it. Your booking for <strong>${turfName}</strong> has been cancelled.</p>
      
      <div class="info-card">
        <div class="info-row"><span class="info-label">Turf</span> <span class="info-value">${turfName}</span></div>
        <div class="info-row"><span class="info-label">Date</span> <span class="info-value">${date} at ${startTime}</span></div>
        <div class="info-row"><span class="info-label">Reason</span> <span class="info-value">${reason || 'User Request'}</span></div>
        <div class="info-row"><span class="info-label">Refund Status</span> <span class="info-value" style="color: #10b981;">₹${refundAmount || 0} initiated</span></div>
      </div>
      
      <p style="font-size: 14px; color: #64748b; text-align: center;">Refunds typically take 5-7 business days to reflect in your account.</p>
      <a href="#" class="btn" style="background: #64748b;">Browse Other Turfs</a>
    `;

    return this.sendMail(email, `Cancellation Confirmed - ${turfName}`, this.getBaseTemplate(content, 'Cancellation Details'));
  }

  async sendPaymentPending(email: string, bookingData: any) {
    const { turfName, amount, expiryTime } = bookingData;

    const content = `
      <div class="hero-text">Don't Lose Your Slot! ⏳</div>
      <p>Your session at <strong>${turfName}</strong> is almost ready. Complete your payment to lock in your time.</p>
      
      <div class="info-card">
        <div class="info-row"><span class="info-label">Venue</span> <span class="info-value">${turfName}</span></div>
        <div class="info-row"><span class="info-label">Amount</span> <span class="info-value">₹${amount}</span></div>
        <div class="info-row"><span class="info-label">Expires At</span> <span class="info-value" style="color: #ef4444;">${expiryTime}</span></div>
      </div>
      
      <a href="#" class="btn">Complete Payment</a>
    `;

    return this.sendMail(email, `Flash Notice: Payment Pending - ${turfName}`, this.getBaseTemplate(content, 'Action Required'));
  }

  async sendNoShowNotice(email: string, bookingData: any) {
    const { turfName, date, startTime } = bookingData;

    const content = `
      <div class="hero-text" style="color: #ef4444;">We Missed You! 🏟️</div>
      <p>Our team at <strong>${turfName}</strong> noticed you couldn't make it to your slot today at ${startTime}.</p>
      
      <div class="info-card" style="border-left: 4px solid #ef4444;">
        <p style="margin: 0; font-size: 15px;"><strong>Date:</strong> ${date}</p>
        <p style="margin: 5px 0 0; font-size: 14px; color: #64748b;">Status: <span class="badge badge-danger">No Show</span></p>
      </div>
      
      <p style="font-size: 14px; text-align: center;">No-shows are non-refundable, but we hope to see you back on the field soon!</p>
      <a href="#" class="btn">Book for Tomorrow</a>
    `;

    return this.sendMail(email, `Missed Booking - ${turfName}`, this.getBaseTemplate(content, 'Attendance Update'));
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
