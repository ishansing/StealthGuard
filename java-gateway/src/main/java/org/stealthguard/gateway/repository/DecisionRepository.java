package org.stealthguard.gateway.repository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.stealthguard.gateway.model.Decision;

public interface DecisionRepository extends JpaRepository<Decision, Long> {

    java.util.Optional<Decision> findTopBySessionIdOrderByCreatedAtDesc(UUID sessionId);

    long countBySessionId(UUID sessionId);

    @Query("SELECT d.decision, COUNT(d) FROM Decision d GROUP BY d.decision")
    List<Object[]> countByDecision();
}