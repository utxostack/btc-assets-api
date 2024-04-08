#!/bin/bash

current_branch="$(git branch --show-current)"
for protected_branch in "main" "develop"; do
  if [[ "$protected_branch" == "$current_branch" ]]; then
    echo "ERROR: local branch $current_branch is protected"
    exit 1
  fi
done

exit 0
