.PHONY: build test clean

## Build the binary
build:
	cc -o app main.c

test: build
	./app --self-test

clean:
	rm -f app
