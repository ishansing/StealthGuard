package org.stealthguard.gateway.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Raw telemetry request (SPEC §6.2). Array-size caps guard against abuse/DoS.
 */
public record TelemetryRequest(
    @jakarta.validation.constraints.NotNull UUID sessionId,
    String page,
    Instant timestamp,
    String sdkVersion,
    String privacyMode,
    @jakarta.validation.constraints.Size(max = 5000) List<KeystrokeDto> keystrokes,
    @jakarta.validation.constraints.Size(max = 5000) List<MouseMoveDto> mouseMoves,
    @jakarta.validation.constraints.Size(max = 5000) List<MouseMoveDto> touchMoves,
    @jakarta.validation.constraints.Size(max = 5000) List<MouseMoveDto> clicks,
    Map<String, Double> features,
    MetaDto meta
) {

    public record KeystrokeDto(String key, Double downTime, Double upTime) {
    }

    public record MouseMoveDto(Double x, Double y, Double t) {
    }

    public record MetaDto(
        String userAgent,
        Integer viewportWidth,
        Integer viewportHeight,
        Integer timezoneOffset,
        String inputModality
    ) {
    }
}