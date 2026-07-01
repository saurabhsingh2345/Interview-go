// Command partner mints API credentials for third-party callers.
//
//	go run ./cmd/partner -name "Acme Corp" -email dev@acme.com
//	go run ./cmd/partner -name "Acme Corp" -key-name "ci"     # extra key for partner created earlier
//
// The raw key is printed ONCE; only its hash is stored.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"os"

	"github.com/eskeon/scale/scale/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"go-app/handles"
	"go-app/model"
	"go-app/settings"
)

func main() {
	name := flag.String("name", "", "partner name (required)")
	email := flag.String("email", "", "partner contact email")
	keyName := flag.String("key-name", "default", "label for the generated key")
	flag.Parse()

	if *name == "" {
		fmt.Fprintln(os.Stderr, "error: -name is required")
		flag.Usage()
		os.Exit(2)
	}

	settings.Config = config.IniConfig[settings.ConfigObject](os.Getenv("STAGE"), os.Getenv("SECRET"))

	db, err := gorm.Open(postgres.Open(settings.Config.App.DSN), &gorm.Config{})
	if err != nil {
		fmt.Fprintf(os.Stderr, "connect to database: %v\n", err)
		os.Exit(1)
	}

	// Reuse an existing active partner with the same name, else create one.
	var partner model.Partner
	if err := db.Where("name = ? AND active = ?", *name, true).First(&partner).Error; err != nil {
		partner = model.Partner{Name: *name, Email: *email, Active: true}
		if err := db.Create(&partner).Error; err != nil {
			fmt.Fprintf(os.Stderr, "create partner: %v\n", err)
			os.Exit(1)
		}
	}

	raw, err := generateKey()
	if err != nil {
		fmt.Fprintf(os.Stderr, "generate key: %v\n", err)
		os.Exit(1)
	}

	key := model.APIKey{
		PartnerID: partner.ID,
		Name:      *keyName,
		KeyHash:   handles.HashAPIKey(raw),
		KeyPrefix: raw[:11],
		Active:    true,
	}
	if err := db.Create(&key).Error; err != nil {
		fmt.Fprintf(os.Stderr, "create api key: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Partner:  %s (id=%d)\n", partner.Name, partner.ID)
	fmt.Printf("Key name: %s\n", key.Name)
	fmt.Printf("API key:  %s\n", raw)
	fmt.Println("\nStore this key now — it cannot be retrieved again.")
	fmt.Printf("Use it as:  Authorization: Bearer %s\n", raw)
}

// generateKey returns a key like sk_live_<48 hex chars>.
func generateKey() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "sk_live_" + hex.EncodeToString(b), nil
}
