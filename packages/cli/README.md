# @depic/cli

Command-line interface for depic. Analyze dependencies, detect cycles, find dependents, and generate interactive graphs — all from your terminal.

## Install

```bash
npm i @depic/cli
```

## Commands

```bash
depic analyze <root>     # Analyze project, output JSON
       --dot             # Output as Graphviz DOT
       --output <file>   # Write to file

depic cycles <root>      # Detect circular dependencies

depic dependents <file>  # Find files that import the given file

depic stats <root>       # Show dependency statistics

depic web <root>         # Generate interactive HTML graph
       --output <file>   # Output path (default: deps.html)

depic serve <root>       # Start local web server with live graph
       --port <n>        # Port (default: 3000)
```

## Examples

```bash
# Analyze and save as JSON
depic analyze ./src --output deps.json

# Check for circular deps
depic cycles ./src

# Generate interactive graph
depic web ./src --output graph.html

# Start live server
depic serve ./src --port 8080
```
