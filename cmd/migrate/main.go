package main

import (
	"fmt"
	"os"

	"github.com/eskeon/scale/scale/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"go-app/migration"
	"go-app/model"
	"go-app/settings"
)

func main() {
	stage := os.Getenv("STAGE")
	secret := os.Getenv("SECRET")

	settings.Config = config.IniConfig[settings.ConfigObject](stage, secret)

	db, err := gorm.Open(postgres.Open(settings.Config.App.DSN), &gorm.Config{})
	if err != nil {
		fmt.Fprintf(os.Stderr, "connect to database: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Running SQL migrations...")
	if err := migration.Run(db); err != nil {
		fmt.Fprintf(os.Stderr, "migration failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Running GORM AutoMigrate...")
	if err := db.AutoMigrate(
		&model.Partner{},
		&model.APIKey{},
		&model.InterviewSession{},
		&model.Interview{},
		&model.Response{},
		&model.Evaluation{},
		&model.FollowUpContext{},
		&model.InterviewReport{},
	); err != nil {
		fmt.Fprintf(os.Stderr, "auto-migrate failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Migration complete.")
}
