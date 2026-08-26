package org.stealthguard.gateway.controller;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.stealthguard.gateway.model.Session;
import org.stealthguard.gateway.repository.DecisionRepository;
import org.stealthguard.gateway.repository.ScoreRepository;
import org.stealthguard.gateway.repository.SessionRepository;

/** Read-only dashboard endpoints (SPEC §8.1, Stretch). */
@RestController
@RequestMapping("/stealthguard/admin")
public class AdminController {

    private final SessionRepository sessionRepository;
    private final DecisionRepository decisionRepository;
    private final ScoreRepository scoreRepository;

    public AdminController(
        SessionRepository sessionRepository,
        DecisionRepository decisionRepository,
        ScoreRepository scoreRepository) {
        this.sessionRepository = sessionRepository;
        this.decisionRepository = decisionRepository;
        this.scoreRepository = scoreRepository;
    }

    @GetMapping("/sessions")
    public Page<Session> sessions(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size) {
        return sessionRepository.findAll(PageRequest.of(page, size));
    }

    @GetMapping("/stats")
    public Map<String, Map<String, Long>> stats() {
        Map<String, Long> decisions = new LinkedHashMap<>();
        for (Object[] row : decisionRepository.countByDecision()) {
            decisions.put((String) row[0], (Long) row[1]);
        }
        Map<String, Long> labels = new LinkedHashMap<>();
        for (Object[] row : scoreRepository.countByLabel()) {
            labels.put((String) row[0], (Long) row[1]);
        }
        return Map.of("decisions", decisions, "labels", labels);
    }
}