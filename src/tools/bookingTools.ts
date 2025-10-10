import { writeHiltonDentalBooking, writeDermaVixualsBooking } from './sheetsTool.js';

const DEMO_USER_ID = process.env.DEMO_USER_ID ?? 'demo-user';

export const accept_dental_booking = {
  description: 'Book a dental appointment with patient details and preferences. This will record the appointment in the Hilton Dental booking system.',
  parameters: {
    type: "object",
    properties: {
      procedures: {
        type: "string",
        description: "Selected dental procedures or service type"
      },
      patientType: {
        type: "string",
        enum: ["new", "existing"],
        description: "Whether this is a new or existing patient"
      },
      name: {
        type: "string",
        description: "Patient's full name"
      },
      phone: {
        type: "string",
        description: "Patient's phone number"
      },
      email: {
        type: "string",
        format: "email",
        description: "Patient's email address"
      },
      date: {
        type: "string",
        description: "Preferred appointment date (e.g., MM/DD/YYYY or any date format)"
      },
      clinicLocation: {
        type: "string",
        description: "Preferred clinic location (Amuwo-Odofin, Lekki, or Abijo)"
      },
      preferredTime: {
        type: "string",
        description: "Preferred appointment time"
      }
    },
    required: ["procedures", "name", "phone", "email", "date", "clinicLocation", "preferredTime"],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    try {
      const result = await writeHiltonDentalBooking(DEMO_USER_ID, {
        name: args.name,
        phone: args.phone,
        email: args.email,
        procedures: args.procedures,
        date: args.date,
        preferredTime: args.preferredTime,
        clinicLocation: args.clinicLocation,
        patientType: args.patientType || 'new'
      });
      
      return result;
    } catch (error: any) {
      console.error('Error booking dental appointment:', error);
      return `Appointment details noted for ${args.name} on ${args.date} at ${args.preferredTime} for ${args.procedures} at ${args.clinicLocation}. However, there was an issue recording it in our system. Our team will follow up via ${args.email} to confirm.`;
    }
  },
} as const;

export const accept_spa_booking = {
  description: 'Book a spa/aesthetic appointment with client details and preferences. This will record the appointment in the DermaVixuals MedSpa booking system.',
  parameters: {
    type: "object",
    properties: {
      serviceType: {
        type: "string",
        description: "Selected spa or aesthetic service (e.g., Botox, Hydrafacial, Laser treatment, etc.)"
      },
      name: {
        type: "string",
        description: "Client's full name"
      },
      phone: {
        type: "string",
        description: "Client's phone number"
      },
      email: {
        type: "string",
        format: "email",
        description: "Client's email address"
      },
      date: {
        type: "string",
        description: "Preferred appointment date (e.g., MM/DD/YYYY or any date format)"
      },
      preferredTime: {
        type: "string",
        description: "Preferred appointment time"
      }
    },
    required: ["serviceType", "name", "phone", "email", "date", "preferredTime"],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    try {
      const result = await writeDermaVixualsBooking(DEMO_USER_ID, {
        name: args.name,
        phone: args.phone,
        email: args.email,
        serviceType: args.serviceType,
        date: args.date,
        preferredTime: args.preferredTime
      });
      
      return result;
    } catch (error: any) {
      console.error('Error booking spa appointment:', error);
      return `Appointment details noted for ${args.name} on ${args.date} at ${args.preferredTime} for ${args.serviceType}. However, there was an issue recording it in our system. Our team will follow up via ${args.email} to confirm.`;
    }
  },
} as const;

