package org.stealthguard.gateway.dto;

import java.util.List;
import java.util.UUID;

/** Decision returned to the SDK (SPEC §8.1). */
public record DecisionResponse(
    UUID sessionId,
    String decision,
    Double humannessScore,
    String modelVersion,
    List<ReasonCodeDto> reasonCodes
) {

    public record ReasonCodeDto(String code, double weight) {
    }
}