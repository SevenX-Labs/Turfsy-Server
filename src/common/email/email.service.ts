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
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; color: #333; }
          .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d); padding: 30px; text-align: center; color: white; }
          .header h1 { margin: 0; font-size: 28px; letter-spacing: 1px; }
          .content { padding: 30px; line-height: 1.6; }
          .invoice-box { background: #f9f9f9; border: 1px solid #eee; padding: 20px; border-radius: 8px; margin-top: 20px; }
          .invoice-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
          .invoice-item:last-child { border-bottom: none; font-weight: bold; font-size: 18px; margin-top: 10px; }
          .footer { background: #f4f7f6; padding: 20px; text-align: center; font-size: 12px; color: #777; }
          .btn { display: inline-block; padding: 12px 25px; background: #b21f1f; color: white !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
          .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
          .badge-success { background: #d4edda; color: #155724; }
          .badge-pending { background: #fff3cd; color: #856404; }
          .badge-danger { background: #f8d7da; color: #721c24; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Turfsy</h1>
            <p>${title}</p>
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            <p>&copy; 2026 Turfsy. All rights reserved.</p>
            <p>If you have any questions, contact us at support@turfsy.com</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async sendBookingConfirmation(email: string, bookingData: any) {
    const { id, turfName, date, startTime, endTime, amount, paymentStatus, pin } = bookingData;
    
    const content = `
      <h2>Booking Confirmed! 🚀</h2>
      <p>Hi there,</p>
      <p>Your booking for <strong>${turfName}</strong> has been confirmed. Get ready for some action!</p>
      
      <div class="invoice-box">
        <h3>Invoice Details</h3>
        <div class="invoice-item"><span>Booking ID:</span> <span>#${id.slice(0, 8)}</span></div>
        <div class="invoice-item"><span>Date:</span> <span>${date}</span></div>
        <div class="invoice-item"><span>Time:</span> <span>${startTime} - ${endTime}</span></div>
        <div class="invoice-item"><span>Payment Status:</span> <span class="badge ${paymentStatus === 'SUCCESS' ? 'badge-success' : 'badge-pending'}">${paymentStatus}</span></div>
        <div class="invoice-item"><span>Check-in PIN:</span> <span style="letter-spacing: 5px; font-size: 20px; font-weight: bold; color: #1a2a6c;">${pin || 'N/A'}</span></div>
        <div class="invoice-item"><span>Total Amount:</span> <span>₹${amount}</span></div>
      </div>
      
      <p style="margin-top:20px;">Please show the Check-in PIN at the ground entrance.</p>
      <a href="#" class="btn">View Booking Details</a>
    `;

    return this.sendMail(email, `Booking Confirmed - ${turfName}`, this.getBaseTemplate(content, 'Booking Confirmation'));
  }

  async sendBookingCancellation(email: string, bookingData: any) {
    const { turfName, date, startTime, amount, refundAmount, reason } = bookingData;

    const content = `
      <h2>Booking Cancelled</h2>
      <p>Hi,</p>
      <p>Your booking for <strong>${turfName}</strong> on ${date} at ${startTime} has been cancelled.</p>
      
      <div class="invoice-box">
        <p><strong>Reason for Cancellation:</strong> ${reason || 'User Request'}</p>
        <div class="invoice-item"><span>Total Paid:</span> <span>₹${amount}</span></div>
        <div class="invoice-item"><span>Refund Amount:</span> <span style="color: #28a745; font-weight: bold;">₹${refundAmount || 0}</span></div>
      </div>
      
      <p>The refund amount (if applicable) will be credited to your account within 3-5 business days.</p>
      <a href="#" class="btn">Book Another Turf</a>
    `;

    return this.sendMail(email, `Booking Cancelled - ${turfName}`, this.getBaseTemplate(content, 'Cancellation Notice'));
  }

  async sendPaymentPending(email: string, bookingData: any) {
    const { turfName, amount, expiryTime } = bookingData;

    const content = `
      <h2>Payment Pending ⏳</h2>
      <p>Hi,</p>
      <p>You have a pending payment for your booking at <strong>${turfName}</strong>.</p>
      <p>Please complete the payment before <strong>${expiryTime}</strong> to secure your slot.</p>
      
      <div class="invoice-box">
        <div class="invoice-item"><span>Payable Amount:</span> <span>₹${amount}</span></div>
      </div>
      
      <a href="#" class="btn">Complete Payment Now</a>
    `;

    return this.sendMail(email, `Action Required: Payment Pending - ${turfName}`, this.getBaseTemplate(content, 'Payment Required'));
  }

  async sendNoShowNotice(email: string, bookingData: any) {
    const { turfName, date, startTime } = bookingData;

    const content = `
      <h2 style="color: #b21f1f;">Missed Your Slot?</h2>
      <p>Hi,</p>
      <p>We noticed that you didn't check in for your booking at <strong>${turfName}</strong> on ${date} at ${startTime}.</p>
      <p>Unfortunately, no-show bookings are not eligible for refunds. If you think this is a mistake, please contact support.</p>
      
      <div class="invoice-box" style="border-left: 4px solid #b21f1f;">
        <p>Status: <span class="badge badge-danger">No Show</span></p>
      </div>
      
      <a href="#" class="btn">Book Again</a>
    `;

    return this.sendMail(email, `No Show Notice: ${turfName}`, this.getBaseTemplate(content, 'Booking Update'));
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
