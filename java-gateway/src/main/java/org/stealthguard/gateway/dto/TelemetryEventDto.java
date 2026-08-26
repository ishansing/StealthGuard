package org.stealthguard.gateway.dto;

import java.time.Instant;
import java.util.Map;

/** Raw telemetry event for dashboard replay. */
public record TelemetryEventDto(Long id, String eventType, Map<String, Object> payload, Instant timestamp) {
}