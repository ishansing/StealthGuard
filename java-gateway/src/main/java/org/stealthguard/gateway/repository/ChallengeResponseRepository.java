package org.stealthguard.gateway.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.stealthguard.gateway.model.ChallengeResponse;

public interface ChallengeResponseRepository extends JpaRepository<ChallengeResponse, Long> {
}
