package settings

import "github.com/eskeon/scale/scale/config"

var Config ConfigObject

type ConfigObject struct {
	App        config.AppConfig    `ini:"app"`
	Redis      config.RedisConfig  `ini:"redis"`
	Spaces     config.SpacesConfig `ini:"spaces"`
	Groq       GroqConfig          `ini:"groq"`
}

type GroqConfig struct {
	APIKey  string `ini:"groq_api_key"`
	Model   string `ini:"model"`
	BaseURL string `ini:"base_url"`
}

