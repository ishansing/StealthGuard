package org.stealthguard.gateway.dto;

import java.time.Instant;
import java.util.UUID;

/** Session-init response (SPEC §6.1). */
public record SessionInitResponse(UUID sessionId, Instant issuedAt) {
}