package org.stealthguard.gateway.service;

import java.util.UUID;

public class SessionNotFoundException extends RuntimeException {

    public SessionNotFoundException(UUID sessionId) {
        super("session not found: " + sessionId);
    }
}