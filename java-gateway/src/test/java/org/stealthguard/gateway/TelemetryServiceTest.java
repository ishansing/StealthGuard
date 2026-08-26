package org.stealthguard.gateway;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.stealthguard.gateway.dto.DecisionResponse;
import org.stealthguard.gateway.dto.TelemetryRequest;
import org.stealthguard.gateway.model.Session;
import org.stealthguard.gateway.service.DecisionService;
import org.stealthguard.gateway.service.MlServiceClient;
import org.stealthguard.gateway.service.MlUnavailableException;
import org.stealthguard.gateway.service.SessionService;
import org.stealthguard.gateway.service.TelemetryService;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TelemetryServiceTest {

    private final SessionService sessionService = mock(SessionService.class);
    private final org.stealthguard.gateway.repository.TelemetryEventRepository eventRepo =
        mock(org.stealthguard.gateway.repository.TelemetryEventRepository.class);
    private final MlServiceClient mlClient = mock(MlServiceClient.class);
    private final DecisionService decisionService = mock(DecisionService.class);

    @Test
    void rawTelemetryComputesFeaturesThenScores() {
        Session session = newSession();
        when(sessionService.ensureFrom(any())).thenReturn(session);
        when(mlClient.computeFeatures(any())).thenReturn(new MlServiceClient.FeatureResponse(Map.of("event_count", 1.0)));
        when(mlClient.score(any(), any())).thenReturn(new MlServiceClient.ScoreDto(0.9, "human", "rule-based", List.of()));
        when(decisionService.record(eq(session), any())).thenReturn(allowed());
        TelemetryService service = new TelemetryService(sessionService, eventRepo, mlClient, decisionService);

        DecisionResponse response = service.ingest(rawRequest());

        assertEquals("allow", response.decision());
        verify(mlClient).computeFeatures(any());
        verify(mlClient).score(any(), any());
        verify(decisionService).record(eq(session), any());
    }

    @Test
    void aggregatedModeUsesProvidedFeatures() {
        Session session = newSession();
        when(sessionService.ensureFrom(any())).thenReturn(session);
        when(mlClient.score(any(), any())).thenReturn(new MlServiceClient.ScoreDto(0.9, "human", "rule-based", List.of()));
        when(decisionService.record(eq(session), any())).thenReturn(allowed());
        TelemetryService service = new TelemetryService(sessionService, eventRepo, mlClient, decisionService);

        TelemetryRequest request = new TelemetryRequest(
            UUID.randomUUID(), "/login", Instant.now(), null, "aggregated",
            List.of(), List.of(), List.of(), List.of(), Map.of("event_count", 2.0), null);
        service.ingest(request);

        verify(mlClient, never()).computeFeatures(any());
        verify(mlClient).score(any(), eq(Map.of("event_count", 2.0)));
    }

    @Test
    void mlFailureFailsSafeToChallenge() {
        Session session = newSession();
        when(sessionService.ensureFrom(any())).thenReturn(session);
        when(mlClient.computeFeatures(any())).thenReturn(new MlServiceClient.FeatureResponse(Map.of("event_count", 1.0)));
        when(mlClient.score(any(), any())).thenThrow(new MlUnavailableException("boom", null));
        when(decisionService.recordFailure(eq(session), any())).thenReturn(
            new DecisionResponse(UUID.randomUUID(), "challenge", null, null, List.of()));
        TelemetryService service = new TelemetryService(sessionService, eventRepo, mlClient, decisionService);

        DecisionResponse response = service.ingest(rawRequest());

        assertEquals("challenge", response.decision());
        verify(decisionService).recordFailure(eq(session), eq("ml-service unavailable"));
    }

    private DecisionResponse allowed() {
        return new DecisionResponse(UUID.randomUUID(), "allow", 0.9, "rule-based", List.of());
    }

    private TelemetryRequest rawRequest() {
        return new TelemetryRequest(
            UUID.randomUUID(), "/login", Instant.now(), "0.1.0", "raw",
            List.of(new TelemetryRequest.KeystrokeDto("a", 1.0, 1.1)),
            List.of(new TelemetryRequest.MouseMoveDto(1.0, 2.0, 3.0)),
            List.of(), List.of(), null, null);
    }

    private Session newSession() {
        Session session = new Session();
        session.setId(UUID.randomUUID());
        session.setPage("/login");
        return session;
    }
}