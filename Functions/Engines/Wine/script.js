include(["Functions", "Filesystem", "Files"]);
include(["Functions", "Filesystem", "Extract"]);
include(["Functions", "Net", "Download"]);

LATEST_STABLE_VERSION = "1.8.6";

/**
 * Wine main prototype
 * @constructor
 */
var Wine = function () {
    var that = this;
    that._wineWebServiceUrl = Bean("propertyReader").getProperty("webservice.wine.url");
    that._wineEnginesDirectory = Bean("propertyReader").getProperty("application.user.engines.wine");
    that._winePrefixesDirectory = Bean("propertyReader").getProperty("application.user.wineprefix");
    that._configFactory = Bean("compatibleConfigFileFormatFactory");
    that._distribution = "staging";
    that._OperatingSystemFetcher = Bean("operatingSystemFetcher");
    that._wineDebug = "-all";

    that._installWinePackage = function (setupWizard, winePackage, localDirectory) {
        var tmpFile = createTempFile("tar.gz");

        new Downloader()
            .wizard(setupWizard)
            .url(winePackage.url)
            .checksum(winePackage.sha1sum)
            .to(tmpFile)
            .get();

        new Extractor()
            .wizard(setupWizard)
            .archive(tmpFile)
            .to(localDirectory)
            .extract();
    };
    that._fetchFullDistributionName = function () {
        var operatingSystem = that._OperatingSystemFetcher.fetchCurrentOperationSystem().getWinePackage();
        return that._distribution + "-" + operatingSystem + "-" + that._architecture;
    };
    that._fetchLocalDirectory = function () {
        return that._wineEnginesDirectory + "/" + that._fetchFullDistributionName() + "/" + that._version;
    };

    that._fetchWineServerBinary = function() {
        return that._fetchLocalDirectory() + "/bin/wineserver";
    };

    that._wineServer = function(parameter) {
        var processBuilder = new java.lang.ProcessBuilder(Java.to([that._fetchWineServerBinary(), parameter], "java.lang.String[]"));
        var environment = processBuilder.environment();
        environment.put("WINEPREFIX", that._prefixDirectory);
        processBuilder.inheritIO();
        var wineServerProcess = processBuilder.start();
        wineServerProcess.waitFor();
    };

    that.wizard = function (wizard) {
        that._wizard = wizard;
        return that;
    };
    that.debug = function (debug) {
        if(!debug) {
            that._wineDebug = "";
        }
        that._wineDebug = debug;
        return that;
    };
    that.architecture = function (architecture) {
        that._architecture = architecture;
        return that;
    };
    that.distribution = function (distribution) {
        that._distribution = distribution;
        return that;
    };
    that.prefix = function (prefix) {
        that._prefix = prefix;
        that._prefixDirectory = that._winePrefixesDirectory + "/" + that._prefix;

        mkdir(that._prefixDirectory);

        that._prefixConfiguration = that._configFactory.open(that._prefixDirectory + "/playonlinux.cfg");

        if (!that._version) {
            that._version = that._prefixConfiguration.readValue("wineVersion");
        } else {
            that._prefixConfiguration.writeValue("wineVersion", that._version);
        }

        if (!that._distribution) {
            that._distribution = that._prefixConfiguration.readValue("wineDistribution");
        } else {
            that._prefixConfiguration.writeValue("wineDistribution", that._distribution);
        }

        if (!that._architecture) {
            var defaultArchitecture = Bean("architectureFetcher").fetchCurrentArchitecture().getNameForWinePackages();
            that._architecture = that._prefixConfiguration.readValue("wineArchitecture", defaultArchitecture);
        }

        that._prefixConfiguration.writeValue("wineArchitecture", that._architecture);


        return that;
    };

    that.workingDirectory = function (directory) {
        that._directory = directory;
        return that;
    };

    that.run = function (executable, args) {
        if(that._wizard) {
            that._wizard.wait("Please wait...");
        }

        var wineBinary = that._fetchLocalDirectory() + "/bin/wine";
        var processBuilder = new java.lang.ProcessBuilder(Java.to([wineBinary, executable].concat(args), "java.lang.String[]"));

        if (that._directory) {
            processBuilder.directory(new java.io.File(that._directory));
        } else {
            processBuilder.directory(new java.io.File(that._prefixDirectory));
        }

        processBuilder.inheritIO();

        var environment = processBuilder.environment();
        environment.put("WINEPREFIX", that._prefixDirectory);

        if(that._wineDebug) {
            environment.put("WINEDEBUG", that._wineDebug);
        }

        that._process = processBuilder.start();

        return that;
    };


    that.wait = function () {
        that._wineServer("-w");
        return that;
    };

    that.kill = function() {
        that._wineServer("-k");
        return that;
    };

    that.getAvailableVersions = function () {
        return new Downloader()
            .wizard(that._wizard)
            .url(that._wineWebServiceUrl)
            .get()
    };

    that.version = function (version) {
        that._version = version;
        print("Selected version: " + that._version);

        var fullDistributionName = that._fetchFullDistributionName();
        var localDirectory = that._fetchLocalDirectory();
        var wizard = that._wizard;

        if (!fileExists(localDirectory)) {
            print("Installing version: " + that._version);

            var wineJson = JSON.parse(that.getAvailableVersions());

            print(that.getAvailableVersions());
            print(distribution);
            print(version);
            wineJson.forEach(function (distribution) {
                if (distribution.name == fullDistributionName) {
                    distribution.packages.forEach(function (winePackage) {
                        if (winePackage.version == version) {
                            that._installWinePackage(wizard, winePackage, localDirectory)
                        }
                    });
                }
            });

            // FIXME : Not found case!

        }

        return that;
    }
};

/**
 * Regedit support
 * @param args
 * @returns {Wine}
 */
Wine.prototype.regedit = function(args) {
    this.run("regedit", args);
    return this;
};

var OverrideDLL = function() {
    var that = this;
    that._regeditFileContent =
        "REGEDIT4\n" +
        "\n"+
        "[HKEY_CURRENT_USER\\Software\\Wine\\DllOverrides]\n";

    that.wine = function(wine) {
        that._wine = wine;
        return that;
    };

    that.set = function(mode, libraries) {
        libraries.forEach(function(library) {
            that._regeditFileContent += "\"*"+library+"\"=\""+mode+"\"\n";
        });

        return that;
    };

    that.do =  function() {
        var tmpFile = createTempFile("reg");
        writeToFile(tmpFile, that._regeditFileContent);
        that._wine.regedit(tmpFile);
        return that._wine;
    }
};

Wine.prototype.overrideDLL = function() {
    return new OverrideDLL()
        .wine(this)
};