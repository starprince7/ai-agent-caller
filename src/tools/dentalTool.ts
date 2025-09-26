

export const accept_dental_booking = {
    description: 'Book a dental appointment with patient details and preferences',
    parameters: {
        type: "object",
        properties: {
            procedures: {
                type: "string",
                description: "Selected dental procedures"
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
                pattern: "^\\d{2}/\\d{2}/\\d{4}$",
                description: "Preferred appointment date in MM/DD/YYYY format"
            },
            clinicLocation: {
                type: "string",
                description: "Preferred clinic location"
            },
            preferredTime: {
                type: "string",
                description: "Preferred appointment time"
            }
        },
        required: ["procedures", "patientType", "name", "phone", "email", "date", "clinicLocation", "preferredTime"],
        additionalProperties: false,
    },
    execute: async (args: any) => {
        // Simulate successful booking
        return `Appointment successfully booked for ${args.name} on ${args.date} at ${args.preferredTime} for ${args.procedures} at ${args.clinicLocation}. Confirmation details will be sent to ${args.email}.`;
    },
} as const;