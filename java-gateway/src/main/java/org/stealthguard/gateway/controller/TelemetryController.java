package org.stealthguard.gateway.controller;

import java.util.UUID;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.stealthguard.gateway.dto.ChallengeResponseRequest;
import org.stealthguard.gateway.dto.DecisionResponse;
import org.stealthguard.gateway.dto.TelemetryRequest;
import org.stealthguard.gateway.service.ChallengeService;
import org.stealthguard.gateway.service.DecisionService;
import org.stealthguard.gateway.service.SessionNotFoundException;
import org.stealthguard.gateway.service.TelemetryService;

@RestController
@RequestMapping("/stealthguard")
public class TelemetryController {

    private final TelemetryService telemetryService;
    private final DecisionService decisionService;
    private final ChallengeService challengeService;

    public TelemetryController(
        TelemetryService telemetryService,
        DecisionService decisionService,
        ChallengeService challengeService) {
        this.telemetryService = telemetryService;
        this.decisionService = decisionService;
        this.challengeService = challengeService;
    }

    /** Ingest telemetry, orchestrate scoring, return the decision (SPEC §8.1). */
    @PostMapping("/telemetry")
    public DecisionResponse telemetry(@Valid @RequestBody TelemetryRequest request) {
        return telemetryService.ingest(request);
    }

    @GetMapping("/decision/{sessionId}")
    public DecisionResponse decision(@PathVariable UUID sessionId) {
        DecisionResponse response = decisionService.latest(sessionId);
        if (response == null) {
            throw new SessionNotFoundException(sessionId);
        }
        return response;
    }

    /** Record a fallback-challenge answer; may upgrade the decision. */
    @PostMapping("/challenge/{sessionId}/respond")
    public DecisionResponse respond(
        @PathVariable UUID sessionId,
        @Valid @RequestBody ChallengeResponseRequest request) {
        return challengeService.respond(sessionId, request);
    }
}