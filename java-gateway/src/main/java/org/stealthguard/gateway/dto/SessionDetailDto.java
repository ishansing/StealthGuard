package org.stealthguard.gateway.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Full session detail for the dashboard: decision, score, and raw events. */
public record SessionDetailDto(
    UUID sessionId,
    String page,
    Instant createdAt,
    String userAgent,
    String inputModality,
    String decision,
    Double humannessScore,
    String modelVersion,
    List<DecisionResponse.ReasonCodeDto> reasonCodes,
    List<TelemetryEventDto> events
) {
}