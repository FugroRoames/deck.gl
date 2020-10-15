# Build Scripts for Roames usage

## Overview
The repository is Fugro Roames fork of the vis Deck.gl github repo.

Initially the complete deck application will be built into a mimified js bundle access via script tags in front end applications

Building and deploying is done in Jenkins [Deck.GL Fugro](https://jenkins.roames.com/job/Land-Geodata/job/DeckGL/ "The engine room".

### Script Information

#### install_yarn.sh
DeckGL requires yarn to build. Jenkins slaves don't have yarn installed so this script will check if yarn is already installed and if not download and install it.

#### build.sh
Builds the bundle - pretty simple - yarn build!!!

#### versioning.sh
Works out a suitable version string to use for the build artifact filename. This is based on the git tag / git commit id / Jenkins build number:

``` dist.FRD-1.0.2-11-g4ee156415d+3.min.js ```

#### jenkins.sh
Copy of code in the jenkins job that builds the application

#### jenkins_deploy.sh
Copy of the code in the jenkins deploy job.


### Git Tags
The tagging semantics are FRD-x.y.z
FRD = Fugro Roames Deckgl
x.y.z = major.minor.revision


