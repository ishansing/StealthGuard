package org.stealthguard.gateway.dto;

import java.time.Instant;
import java.util.UUID;

/** Dashboard session list row (SPEC §8.1 admin endpoints). */
public record SessionSummaryDto(
    UUID sessionId,
    String page,
    Instant createdAt,
    String userAgent,
    String inputModality,
    String decision,
    Double humannessScore,
    String modelVersion
) {
}