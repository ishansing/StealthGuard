package org.stealthguard.gateway.controller;

import java.util.Map;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.stealthguard.gateway.dto.SessionInitResponse;
import org.stealthguard.gateway.model.Session;
import org.stealthguard.gateway.service.SessionService;

@RestController
@RequestMapping("/stealthguard")
public class SessionController {

    private final SessionService sessionService;

    public SessionController(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    /** Issues a session_id for the SDK to attach telemetry to (SPEC §6.1). */
    @PostMapping("/session/init")
    public SessionInitResponse init(@RequestBody(required = false) Map<String, String> body) {
        Session session = sessionService.create(body == null ? null : body.get("page"));
        return new SessionInitResponse(session.getId(), session.getCreatedAt());
    }
}