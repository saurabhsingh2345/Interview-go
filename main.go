package main

import (
	"os"

	"github.com/eskeon/scale/scale"
	"github.com/eskeon/scale/scale/config"
	"github.com/eskeon/scale/scale/logger"

	"go-app/settings"
)

const Name = "go-app"

func main() {
	stage := os.Getenv("STAGE")
	secret := os.Getenv("SECRET")
	tag := os.Getenv("TAG")

	logger.Infof("Tag: %s", tag)

	settings.Config = config.IniConfig[settings.ConfigObject](stage, secret)

	app := scale.NewApplication(
		Name,
		stage,
		settings.Config.App.Debug,
	)

	app.SetDsn(settings.Config.App.DSN)
	app.Bind(&Service{})
	scale.Cli(app)
}
