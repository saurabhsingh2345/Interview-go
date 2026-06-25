package migration

import (
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
)

//go:embed sql/*.sql
var sqlFiles embed.FS

type schemaMigration struct {
	Version   string    `gorm:"primaryKey;type:varchar(255)"`
	AppliedAt time.Time `gorm:"autoCreateTime"`
}

func (schemaMigration) TableName() string { return "schema_migrations" }

// Run applies any pending versioned SQL migrations, then returns.
// Call this before GORM AutoMigrate so type-change migrations run first.
func Run(db *gorm.DB) error {
	if err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT        PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`).Error; err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	var applied []schemaMigration
	if err := db.Find(&applied).Error; err != nil {
		return fmt.Errorf("query schema_migrations: %w", err)
	}
	done := make(map[string]bool, len(applied))
	for _, m := range applied {
		done[m.Version] = true
	}

	entries, err := fs.ReadDir(sqlFiles, "sql")
	if err != nil {
		return fmt.Errorf("read sql dir: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })

	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".sql") {
			continue
		}
		if done[name] {
			fmt.Printf("  [skip] %s\n", name)
			continue
		}

		content, err := fs.ReadFile(sqlFiles, "sql/"+name)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		sql := strings.TrimSpace(string(content))
		if sql == "" {
			continue
		}

		fmt.Printf("  [run]  %s\n", name)
		if err := db.Exec(sql).Error; err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
		if err := db.Create(&schemaMigration{Version: name}).Error; err != nil {
			return fmt.Errorf("record %s: %w", name, err)
		}
		fmt.Printf("  [done] %s\n", name)
	}
	return nil
}
