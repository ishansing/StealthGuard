package org.stealthguard.gateway.service;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.stealthguard.gateway.dto.TelemetryRequest;
import org.stealthguard.gateway.model.Session;
import org.stealthguard.gateway.repository.SessionRepository;

@Service
public class SessionService {

    private final SessionRepository sessionRepository;

    public SessionService(SessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    /** Create a session up front (SPEC §6.1); the SDK will attach telemetry to it. */
    public Session create(String page) {
        Session session = new Session();
        session.setId(UUID.randomUUID());
        session.setPage(page != null ? page : "/");
        session.setCreatedAt(Instant.now());
        return sessionRepository.save(session);
    }

    /** Find an existing session or create one from the telemetry payload. */
    public Session ensureFrom(TelemetryRequest request) {
        Optional<Session> existing = sessionRepository.findById(request.sessionId());
        if (existing.isPresent()) {
            return existing.get();
        }
        Session session = new Session();
        session.setId(request.sessionId());
        session.setPage(request.page() != null ? request.page() : "/");
        session.setCreatedAt(Instant.now());
        if (request.meta() != null) {
            applyMeta(session, request.meta());
        }
        return sessionRepository.save(session);
    }

    public Session require(UUID sessionId) {
        return sessionRepository.findById(sessionId)
            .orElseThrow(() -> new SessionNotFoundException(sessionId));
    }

    public void applyMeta(Session session, TelemetryRequest.MetaDto meta) {
        session.setUserAgent(meta.userAgent());
        session.setViewportWidth(meta.viewportWidth());
        session.setViewportHeight(meta.viewportHeight());
        session.setTimezoneOffset(meta.timezoneOffset());
        session.setInputModality(meta.inputModality());
    }
}