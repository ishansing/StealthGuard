package org.stealthguard.gateway.web;

/** Shared error response shape (SPEC §8.1). */
public record ErrorResponse(String error, String message, String sessionId) {
}