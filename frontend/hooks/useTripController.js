"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { tripApi } from "../lib/api";
import { ApiError, getErrorMessage } from "../lib/errors";
import {
  buildShareUrl,
  persistTripId,
  resolveTripId,
} from "../lib/trip-storage";

export function useTripController({
  api = tripApi,
  initialTripId,
  autoLoad = true,
} = {}) {
  const [trip, setTrip] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [lastChangedIds, setLastChangedIds] = useState([]);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState({ status: "idle", action: null });

  const mountedRef = useRef(true);
  const requestRef = useRef(null);
  const mutationLockRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, []);

  const runAction = useCallback(async (action, operation, options = {}) => {
    if (options.mutation && mutationLockRef.current) return null;
    if (options.mutation) mutationLockRef.current = true;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    if (mountedRef.current) {
      setError(null);
      setPhase({ status: "loading", action });
    }

    try {
      const result = await operation(controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return null;
      setPhase({ status: "success", action });
      return result;
    } catch (caught) {
      if (
        controller.signal.aborted ||
        (caught instanceof ApiError && caught.kind === "aborted")
      ) {
        return null;
      }
      if (mountedRef.current) {
        setError(getErrorMessage(caught));
        setPhase({ status: "error", action });
      }
      return null;
    } finally {
      if (options.mutation) mutationLockRef.current = false;
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, []);

  const loadTrip = useCallback(
    async (tripId) => {
      const nextTrip = await runAction("load", (signal) =>
        api.getTrip(tripId, signal),
      );
      if (!nextTrip || !mountedRef.current) return null;
      persistTripId(nextTrip.trip_id);
      setTrip(nextTrip);
      setEvidence([]);
      setLastChangedIds([]);
      return nextTrip;
    },
    [api, runAction],
  );

  useEffect(() => {
    if (!autoLoad) return;
    const tripId = initialTripId || resolveTripId();
    if (!tripId) return;

    const timer = setTimeout(() => {
      void loadTrip(tripId);
    }, 0);
    return () => clearTimeout(timer);
  }, [autoLoad, initialTripId, loadTrip]);

  const initializeTrip = useCallback(
    async (message) => {
      const nextTrip = await runAction(
        "initialize",
        (signal) =>
          api.initTrip({ message, trip_id: trip?.trip_id || null }, signal),
        { mutation: true },
      );
      if (!nextTrip || !mountedRef.current) return null;
      persistTripId(nextTrip.trip_id);
      setTrip(nextTrip);
      setEvidence([]);
      setLastChangedIds([]);
      return nextTrip;
    },
    [api, runAction, trip?.trip_id],
  );

  const parseOrder = useCallback(
    async (orderText) => {
      if (!trip) {
        setError("请先创建或读取行程");
        return null;
      }
      const block = await runAction(
        "parse-order",
        (signal) =>
          api.parseOrder(
            { trip_id: trip.trip_id, order_text: orderText },
            signal,
          ),
        { mutation: true },
      );
      if (!block || !mountedRef.current) return null;

      setTrip((current) => {
        if (!current) return current;
        return {
          ...current,
          blocks: current.blocks
            .filter((item) => item.block_id !== block.block_id)
            .concat(block)
            .sort((left, right) =>
              `${left.day}-${left.time_slot}`.localeCompare(
                `${right.day}-${right.time_slot}`,
              ),
            ),
        };
      });
      return block;
    },
    [api, runAction, trip],
  );

  const recompute = useCallback(
    async (change) => {
      if (!trip) {
        setError("请先创建或读取行程");
        return null;
      }
      const response = await runAction(
        "recompute",
        (signal) =>
          api.recomputeTrip(
            { trip_id: trip.trip_id, change },
            signal,
          ),
        { mutation: true },
      );
      if (!response || !mountedRef.current) return null;
      const { changed_ids: changedIds, ...nextTrip } = response;
      setTrip(nextTrip);
      setEvidence([]);
      setLastChangedIds(changedIds);
      return response;
    },
    [api, runAction, trip],
  );

  const search = useCallback(
    async (query) => {
      if (!trip) {
        setError("请先创建或读取行程");
        return null;
      }
      const results = await runAction("search", (signal) =>
        api.searchEvidence({ trip_id: trip.trip_id, query }, signal),
      );
      if (!results || !mountedRef.current) return null;
      setEvidence(results);
      return results;
    },
    [api, runAction, trip],
  );

  const shareUrl = trip ? buildShareUrl(trip.trip_id) : null;
  const isBusy = phase.status === "loading";

  return {
    trip,
    evidence,
    lastChangedIds,
    error,
    phase,
    isBusy,
    busyAction: isBusy ? phase.action : null,
    shareUrl,
    clearError: () => setError(null),
    loadTrip,
    initializeTrip,
    parseOrder,
    recompute,
    search,
  };
}
