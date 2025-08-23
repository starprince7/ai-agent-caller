// outbound-caller.ts - Script to initiate outbound calls
// This file creates SIP participants that trigger the main agent
import { SipClient, RoomServiceClient } from 'livekit-server-sdk';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

interface OutboundCallConfig {
  toNumber: string;
  fromNumber?: string;
  roomName?: string;
}

class OutboundCallService {
  private roomService: RoomServiceClient;
  private sipClient: SipClient;
  private sipTrunkId: string;

  constructor() {
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    this.sipTrunkId = process.env.SIP_TRUNK_ID!;

    if (!url || !apiKey || !apiSecret || !this.sipTrunkId) {
      throw new Error(
        'Missing required environment variables: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, SIP_TRUNK_ID'
      );
    }

    this.roomService = new RoomServiceClient(url, apiKey, apiSecret);
    this.sipClient = new SipClient(url, apiKey, apiSecret);
  }

  async makeOutboundCall(config: OutboundCallConfig): Promise<void> {
    const roomName = config.roomName || `outbound-call-${Date.now()}`;

    try {
      console.log(`Creating room: ${roomName}`);

      // Create the room first (recommended for outbound calls)
      await this.roomService.createRoom({
        name: roomName,
        emptyTimeout: 300, // Room deletes after 5 minutes of being empty
        maxParticipants: 10,
      });

      console.log(`Initiating outbound call to: ${config.toNumber}`);

      // Create SIP participant - this triggers the actual phone call
      // When successful, this will cause your main agent.ts to handle the conversation
      const sipParticipant = await this.sipClient.createSipParticipant(
        this.sipTrunkId,     // Which SIP trunk to use
        config.toNumber,     // Phone number to call
        roomName,           // Room to put the call in
        {
          playDialtone: true, // Play dialtone while connecting
          ...(config.fromNumber && { from: config.fromNumber }),
        }
      );

      console.log(`✅ Outbound call initiated successfully!`);
      console.log(`   Room: ${roomName}`);
      console.log(`   SIP Participant: ${sipParticipant.participantId}`);
      console.log(`   Calling: ${config.toNumber}`);
      if (config.fromNumber) {
        console.log(`   From: ${config.fromNumber}`);
      }
      console.log(`   🤖 Your agent will handle the conversation once connected.`);

    } catch (error) {
      console.error('❌ Failed to initiate outbound call:', error);
      throw error;
    }
  }
}

// CLI interface for making calls from command line
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: npm run make-call <to-number> [from-number] [room-name]');
    console.log('Examples:');
    console.log('  npm run make-call +1234567890');
    console.log('  npm run make-call +1234567890 +0987654321');
    console.log('  npm run make-call +1234567890 +0987654321 my-call-room');
    process.exit(1);
  }

  const [toNumber, fromNumber, roomName] = args;

  try {
    const callService = new OutboundCallService();
    await callService.makeOutboundCall({
      toNumber,
      fromNumber,
      roomName,
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Export for use as a module in other files
export { OutboundCallService };

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}