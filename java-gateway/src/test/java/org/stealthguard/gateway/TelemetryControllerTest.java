package org.stealthguard.gateway;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.stealthguard.gateway.controller.TelemetryController;
import org.stealthguard.gateway.dto.DecisionResponse;
import org.stealthguard.gateway.service.ChallengeService;
import org.stealthguard.gateway.service.DecisionService;
import org.stealthguard.gateway.service.TelemetryService;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(TelemetryController.class)
class TelemetryControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockBean
    TelemetryService telemetryService;

    @MockBean
    DecisionService decisionService;

    @MockBean
    ChallengeService challengeService;

    @Test
    void happyPathReturnsDecision() throws Exception {
        when(telemetryService.ingest(any())).thenReturn(
            new DecisionResponse(UUID.randomUUID(), "allow", 0.9, "rule-based", List.of()));

        mockMvc.perform(post("/stealthguard/telemetry")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"session_id":"00000000-0000-0000-0000-000000000001","page":"/login",
                     "keystrokes":[{"key":"a","down_time":1.0,"up_time":1.1}]}"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.decision").value("allow"))
            .andExpect(jsonPath("$.humanness_score").value(0.9));
    }

    @Test
    void oversizedPayloadRejected() throws Exception {
        StringBuilder body = new StringBuilder("{\"session_id\":\"00000000-0000-0000-0000-000000000001\",\"keystrokes\":[");
        for (int i = 0; i < 5001; i++) {
            body.append("{\"key\":\"a\",\"down_time\":1.0,\"up_time\":1.1},");
        }
        body.setLength(body.length() - 1);
        body.append("]}");

        mockMvc.perform(post("/stealthguard/telemetry")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body.toString()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));
    }

    @Test
    void malformedJsonRejected() throws Exception {
        mockMvc.perform(post("/stealthguard/telemetry")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{not json"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("MALFORMED_JSON"));
    }
}