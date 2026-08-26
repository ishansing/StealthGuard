package org.stealthguard.gateway.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.stealthguard.gateway.model.Feedback;

public interface FeedbackRepository extends JpaRepository<Feedback, Long> {
}
