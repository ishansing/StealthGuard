package org.stealthguard.gateway.dto;

import java.util.UUID;

/** Human-in-the-loop correction from the dashboard (SPEC §7 feedback). */
public record AdminFeedbackRequest(UUID sessionId, String reviewer, String correctedLabel) {
}