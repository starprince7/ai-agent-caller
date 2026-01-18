// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

import { llm } from '@livekit/agents';

import {
  cancel_event,
  create_event,
  find_free_slots,
  get_calendars,
  get_primary_calendar,
  reschedule_event,
} from './calendarAgentTools.js';
import { accept_dental_booking, accept_spa_booking } from './bookingTools.js';
import { send_email } from './emailTool.js';

/**
 * Create tool configurations for the voice agent
 * Pre-configured to avoid recreation per session
 */
export const createToolConfigurations = () => ({
  get_calendars: llm.tool({
    description: get_calendars.description,
    parameters: get_calendars.parameters,
    execute: get_calendars.execute,
  }),
  get_primary_calendar: llm.tool({
    description: get_primary_calendar.description,
    parameters: get_primary_calendar.parameters,
    execute: get_primary_calendar.execute,
  }),
  create_event: llm.tool({
    description: create_event.description,
    parameters: create_event.parameters,
    execute: create_event.execute,
  }),
  cancel_event: llm.tool({
    description: cancel_event.description,
    parameters: cancel_event.parameters,
    execute: cancel_event.execute,
  }),
  reschedule_event: llm.tool({
    description: reschedule_event.description,
    parameters: reschedule_event.parameters,
    execute: reschedule_event.execute,
  }),
  find_free_slots: llm.tool({
    description: find_free_slots.description,
    parameters: find_free_slots.parameters,
    execute: find_free_slots.execute,
  }),
  accept_dental_booking: llm.tool({
    description: accept_dental_booking.description,
    parameters: accept_dental_booking.parameters,
    execute: accept_dental_booking.execute,
  }),
  accept_spa_booking: llm.tool({
    description: accept_spa_booking.description,
    parameters: accept_spa_booking.parameters,
    execute: accept_spa_booking.execute,
  }),
  send_email: llm.tool({
    description: send_email.description,
    parameters: send_email.parameters,
    execute: send_email.execute,
  }),
});

// Singleton tool configurations - created once and reused
export const TOOL_CONFIGS = createToolConfigurations();

// Re-export individual tools for direct access if needed
export {
  cancel_event,
  create_event,
  find_free_slots,
  get_calendars,
  get_primary_calendar,
  reschedule_event,
} from './calendarAgentTools.js';
export { accept_dental_booking, accept_spa_booking } from './bookingTools.js';
export { send_email } from './emailTool.js';
export { send_booking_email } from './bookingEmail.js';
