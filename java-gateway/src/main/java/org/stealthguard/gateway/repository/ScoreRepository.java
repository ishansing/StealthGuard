package org.stealthguard.gateway.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.stealthguard.gateway.model.Score;

public interface ScoreRepository extends JpaRepository<Score, Long> {
}
