package org.stealthguard.gateway.repository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.stealthguard.gateway.model.Score;

public interface ScoreRepository extends JpaRepository<Score, Long> {

    long countBySessionId(UUID sessionId);

    @Query("SELECT s.label, COUNT(s) FROM Score s WHERE s.isShadow = false GROUP BY s.label")
    List<Object[]> countByLabel();
}