export async function sendEmail(args: any) {
    console.log(`Sending email to: ${args.to} with subject: ${args.subject}`);

    try {
        const emailData = {
            to: args.to,
            subject: args.subject,
            greeting: args.greeting,
            bodyHtml: args.bodyHtml,
            ...(args.ctaLabel && { ctaLabel: args.ctaLabel }),
            ...(args.ctaUrl && { ctaUrl: args.ctaUrl }),
            ...(args.headerImageUrl && { headerImageUrl: args.headerImageUrl }),
        };

        const response = await fetch('https://www.starprince.dev/api/resend-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailData),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Email API returned status ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log('Email sent successfully:', result);

        return `Email sent successfully to ${args.to} with subject "${args.subject}". The email has been delivered.`;
    } catch (error) {
        console.error(`Failed to send email to ${args.to}:`, error);
        return `I'm sorry, I couldn't send the email to ${args.to} right now. Please try again later or check the email address.`;
    }
}