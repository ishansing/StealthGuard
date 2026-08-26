package org.stealthguard.gateway.web;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Runtime PII-shape guard (SPEC §10): rejects any request whose JSON keys look
 * PII-shaped before the controller sees it, so PII never lands in
 * telemetry_events. Applies to the telemetry path only. The body is buffered
 * once so the controller can still read it.
 */
@Component
public class PiiFilter extends OncePerRequestFilter {

    private static final Set<String> STRICT_KEYS = Set.of(
        "email", "name", "phone", "aadhaar", "ssn", "pan", "passport",
        "password", "address", "dob", "government_id", "account_number");

    private static final String[] SENSITIVE_TOKENS = {
        "email", "aadhaar", "phone", "ssn", "passport", "pan_card", "account_number"};

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"/stealthguard/telemetry".equals(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
        throws ServletException, IOException {

        CachedBodyRequestWrapper wrapped = new CachedBodyRequestWrapper(request);
        if (wrapped.getContentType() != null
            && wrapped.getContentType().startsWith(MediaType.APPLICATION_JSON_VALUE)
            && containsPii(wrapped.body())) {
            response.setStatus(422);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(
                "{\"error\":\"PII_GUARD\",\"message\":\"Request contains PII-shaped fields\",\"sessionId\":null}");
            return;
        }
        filterChain.doFilter(wrapped, response);
    }

    private boolean containsPii(byte[] body) {
        if (body == null || body.length == 0) {
            return false;
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            return scan(root);
        } catch (IOException e) {
            return false;
        }
    }

    private boolean scan(JsonNode node) {
        if (node.isObject()) {
            for (var it = node.fields(); it.hasNext();) {
                var entry = it.next();
                if (isPiiKey(entry.getKey()) || scan(entry.getValue())) {
                    return true;
                }
            }
        } else if (node.isArray()) {
            for (JsonNode child : node) {
                if (scan(child)) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean isPiiKey(String key) {
        String lower = key.toLowerCase();
        if (STRICT_KEYS.contains(lower)) {
            return true;
        }
        for (String token : SENSITIVE_TOKENS) {
            if (lower.contains(token)) {
                return true;
            }
        }
        return false;
    }

    /** Buffers the request body once; downstream reads re-serve the buffer. */
    private static final class CachedBodyRequestWrapper extends HttpServletRequestWrapper {

        private final byte[] body;

        CachedBodyRequestWrapper(HttpServletRequest request) throws IOException {
            super(request);
            this.body = request.getInputStream().readAllBytes();
        }

        byte[] body() {
            return body;
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream buffer = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override
                public int read() {
                    return buffer.read();
                }

                @Override
                public boolean isFinished() {
                    return buffer.available() == 0;
                }

                @Override
                public boolean isReady() {
                    return true;
                }

                @Override
                public void setReadListener(ReadListener readListener) {
                }
            };
        }

        @Override
        public BufferedReader getReader() {
            return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
        }
    }
}