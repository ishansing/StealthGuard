package org.stealthguard.gateway.model;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "scores")
@Getter
@Setter
@NoArgsConstructor
public class Score {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false)
    private Session session;

    @Column(name = "humanness_score", nullable = false)
    private double humannessScore;

    private String label;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "model_version")
    private ModelRegistry modelVersion;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "reason_codes")
    private List<Map<String, Object>> reasonCodes;

    @Column(name = "is_shadow", nullable = false)
    private boolean isShadow;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}