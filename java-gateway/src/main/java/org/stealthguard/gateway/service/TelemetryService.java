package org.stealthguard.gateway.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import net.logstash.logback.marker.Markers;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.stealthguard.gateway.dto.DecisionResponse;
import org.stealthguard.gateway.dto.TelemetryRequest;
import org.stealthguard.gateway.model.Session;
import org.stealthguard.gateway.model.TelemetryEvent;
import org.stealthguard.gateway.repository.TelemetryEventRepository;

/**
 * Orchestrates telemetry ingest (SPEC §6.2 / Appendix A): persist the session +
 * raw events, derive features (Python owns the formulas — ADR 0004), score,
 * and record the decision. ML failure degrades to `challenge` (ADR 0005).
 */
@Service
public class TelemetryService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryService.class);

    private final SessionService sessionService;
    private final TelemetryEventRepository eventRepository;
    private final MlServiceClient mlClient;
    private final DecisionService decisionService;

    public TelemetryService(
        SessionService sessionService,
        TelemetryEventRepository eventRepository,
        MlServiceClient mlClient,
        DecisionService decisionService) {
        this.sessionService = sessionService;
        this.eventRepository = eventRepository;
        this.mlClient = mlClient;
        this.decisionService = decisionService;
    }

    @Transactional
    public DecisionResponse ingest(TelemetryRequest request) {
        long start = System.nanoTime();
        Session session = sessionService.ensureFrom(request);
        if (request.meta() != null) {
            sessionService.applyMeta(session, request.meta());
        }
        persistEvents(session, request);

        DecisionResponse response;
        try {
            Map<String, Double> features = resolveFeatures(request);
            MlServiceClient.ScoreDto score = mlClient.score(request.sessionId().toString(), features);
            response = decisionService.record(session, score, modalityOf(request));
        } catch (RuntimeException e) {
            // Fail-safe boundary (ADR 0005): any ML path failure (timeout, retry
            // exhaustion, open circuit breaker) degrades to challenge, never allow.
            log.warn("session {} failing safe to challenge: {}", request.sessionId(), e.getMessage());
            response = decisionService.recordFailure(session, "ml-service unavailable");
        }
        long latencyMs = (System.nanoTime() - start) / 1_000_000;
        log.info("telemetry processed",
            Markers.append("session_id", request.sessionId().toString()),
            Markers.append("latency_ms", latencyMs),
            Markers.append("decision", response.decision()),
            Markers.append("events", totalEvents(request)));
        return response;
    }

    private String modalityOf(TelemetryRequest request) {
        return request.meta() == null ? null : request.meta().inputModality();
    }

    private long totalEvents(TelemetryRequest request) {
        return (request.keystrokes() == null ? 0 : request.keystrokes().size())
            + (request.mouseMoves() == null ? 0 : request.mouseMoves().size())
            + (request.touchMoves() == null ? 0 : request.touchMoves().size())
            + (request.clicks() == null ? 0 : request.clicks().size());
    }

    private Map<String, Double> resolveFeatures(TelemetryRequest request) {
        if (request.features() != null && !request.features().isEmpty()) {
            return request.features();
        }
        return mlClient.computeFeatures(rawTelemetry(request)).features();
    }

    private void persistEvents(Session session, TelemetryRequest request) {
        List<TelemetryEvent> events = new ArrayList<>();
        Instant ts = request.timestamp() != null ? request.timestamp() : Instant.now();
        if (request.keystrokes() != null) {
            for (TelemetryRequest.KeystrokeDto k : request.keystrokes()) {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("key", k.key());
                payload.put("down_time", k.downTime());
                payload.put("up_time", k.upTime());
                events.add(event(session, "keystroke", payload, ts));
            }
        }
        if (request.mouseMoves() != null) {
            for (TelemetryRequest.MouseMoveDto m : request.mouseMoves()) {
                events.add(event(session, "mouse_move", point(m), ts));
            }
        }
        if (request.touchMoves() != null) {
            for (TelemetryRequest.MouseMoveDto m : request.touchMoves()) {
                events.add(event(session, "touch_move", point(m), ts));
            }
        }
        if (request.clicks() != null) {
            for (TelemetryRequest.MouseMoveDto m : request.clicks()) {
                events.add(event(session, "click", point(m), ts));
            }
        }
        eventRepository.saveAll(events);
    }

    /** Rebuild the §6.2 raw-telemetry shape the ML /features endpoint consumes. */
    private Map<String, Object> rawTelemetry(TelemetryRequest request) {
        List<Map<String, Object>> keys = new ArrayList<>();
        if (request.keystrokes() != null) {
            for (TelemetryRequest.KeystrokeDto k : request.keystrokes()) {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("key", k.key());
                payload.put("down_time", k.downTime());
                payload.put("up_time", k.upTime());
                keys.add(payload);
            }
        }
        return Map.of(
            "keystrokes", keys,
            "mouse_moves", rawPoints(request.mouseMoves()),
            "touch_moves", rawPoints(request.touchMoves()),
            "clicks", rawPoints(request.clicks()),
            "signals", request.signals() == null ? Map.of() : request.signals());
    }

    private List<Map<String, Object>> rawPoints(List<TelemetryRequest.MouseMoveDto> moves) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (moves != null) {
            for (TelemetryRequest.MouseMoveDto m : moves) {
                out.add(point(m));
            }
        }
        return out;
    }

    private Map<String, Object> point(TelemetryRequest.MouseMoveDto m) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("x", m.x());
        p.put("y", m.y());
        p.put("t", m.t());
        return p;
    }

    private TelemetryEvent event(Session session, String type, Map<String, Object> payload, Instant ts) {
        TelemetryEvent event = new TelemetryEvent();
        event.setSession(session);
        event.setEventType(type);
        event.setPayload(payload);
        event.setTimestamp(ts);
        return event;
    }
}