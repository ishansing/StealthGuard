package org.stealthguard.gateway.service;

/** The ML service is unreachable or failed; the gateway must fail safe. */
public class MlUnavailableException extends RuntimeException {

    public MlUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}