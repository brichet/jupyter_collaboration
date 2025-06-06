# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.
from __future__ import annotations

import json
from asyncio import Event, create_task, sleep
from datetime import datetime
from typing import Any

import nbformat
import pytest
from httpx_ws import aconnect_ws
from jupyter_server_ydoc.loaders import FileLoader
from jupyter_server_ydoc.rooms import DocumentRoom
from jupyter_server_ydoc.stores import SQLiteYStore
from jupyter_ydoc import YNotebook, YUnicode
from pycrdt_websocket import WebsocketProvider

from .test_utils import (
    FakeContentsManager,
    FakeEventLogger,
    FakeFileIDManager,
    Websocket,
)


@pytest.fixture
def rtc_document_save_delay():
    return 1


@pytest.fixture
def jp_server_config(jp_root_dir, jp_server_config, rtc_document_save_delay):
    return {
        "ServerApp": {
            "jpserver_extensions": {
                "jupyter_server_ydoc": True,
                "jupyter_server_fileid": True,
            },
            "token": "",
            "password": "",
            "disable_check_xsrf": True,
        },
        "SQLiteYStore": {"db_path": str(jp_root_dir.joinpath(".rtc_test.db"))},
        "BaseFileIdManager": {
            "root_dir": str(jp_root_dir),
            "db_path": str(jp_root_dir.joinpath(".fid_test.db")),
            "db_journal_mode": "OFF",
        },
        "YDocExtension": {"document_save_delay": rtc_document_save_delay},
    }


@pytest.fixture
def rtc_create_file(jp_root_dir, jp_serverapp, rtc_add_doc_to_store):
    """Creates a text file in the test's home directory."""
    fim = jp_serverapp.web_app.settings["file_id_manager"]

    async def _inner(
        path: str, content: str | None = None, index: bool = False, store: bool = False
    ) -> tuple[str, str]:
        file_path = jp_root_dir.joinpath(path)
        # If the file path has a parent directory, make sure it's created.
        parent = file_path.parent
        parent.mkdir(parents=True, exist_ok=True)

        if content is None:
            content = ""

        file_path.write_text(content)

        if index:
            fim.index(path)

        if store:
            await rtc_add_doc_to_store("text", "file", path)

        return path, content

    return _inner


@pytest.fixture
def rtc_create_notebook(jp_root_dir, jp_serverapp, rtc_add_doc_to_store):
    """Creates a notebook in the test's home directory."""
    fim = jp_serverapp.web_app.settings["file_id_manager"]

    async def _inner(
        path: str, content: str | None = None, index: bool = False, store: bool = False
    ) -> tuple[str, str]:
        nbpath = jp_root_dir.joinpath(path)
        # Check that the notebook has the correct file extension.
        if nbpath.suffix != ".ipynb":
            msg = "File extension for notebook must be .ipynb"
            raise Exception(msg)
        # If the notebook path has a parent directory, make sure it's created.
        parent = nbpath.parent
        parent.mkdir(parents=True, exist_ok=True)

        # Create a notebook string and write to file.
        if content is None:
            nb = nbformat.v4.new_notebook()
            content = nbformat.writes(nb, version=4)

        nbpath.write_text(content)

        if index:
            fim.index(path)

        if store:
            await rtc_add_doc_to_store("json", "notebook", path)

        return path, content

    return _inner


@pytest.fixture
def rtc_fetch_session(jp_fetch):
    def _inner(format: str, type: str, path: str) -> Any:
        return jp_fetch(
            "/api/collaboration/session",
            path,
            method="PUT",
            body=json.dumps({"format": format, "type": type}),
        )

    return _inner


@pytest.fixture
def rtc_connect_awareness_client(jp_http_port, jp_base_url):
    async def _inner(room_id: str) -> Any:
        return aconnect_ws(
            f"http://127.0.0.1:{jp_http_port}{jp_base_url}api/collaboration/room/{room_id}"
        )

    return _inner


@pytest.fixture
def rtc_connect_doc_client(jp_http_port, jp_base_url, rtc_fetch_session):
    async def _inner(format: str, type: str, path: str) -> Any:
        resp = await rtc_fetch_session(format, type, path)
        data = json.loads(resp.body.decode("utf-8"))
        room_name = f"{data['format']}:{data['type']}:{data['fileId']}"
        return (
            aconnect_ws(
                f"http://127.0.0.1:{jp_http_port}{jp_base_url}api/collaboration/room/{room_name}?sessionId={data['sessionId']}"
            ),
            room_name,
        )

    return _inner


@pytest.fixture
def rtc_connect_fork_client(jp_http_port, jp_base_url, rtc_fetch_session):
    async def _inner(room_id: str) -> Any:
        return aconnect_ws(
            f"http://127.0.0.1:{jp_http_port}{jp_base_url}api/collaboration/room/{room_id}"
        )

    return _inner


@pytest.fixture
def rtc_get_forks_client(jp_fetch):
    async def _inner(root_roomid: str) -> Any:
        return await jp_fetch(
            "/api/collaboration/fork",
            root_roomid,
            method="GET",
        )

    return _inner


@pytest.fixture
def rtc_create_fork_client(jp_fetch):
    async def _inner(
        root_roomid: str,
        synchronize: bool,
        title: str | None = None,
        description: str | None = None,
    ) -> Any:
        return await jp_fetch(
            "/api/collaboration/fork",
            root_roomid,
            method="PUT",
            body=json.dumps(
                {
                    "synchronize": synchronize,
                    "title": title,
                    "description": description,
                }
            ),
        )

    return _inner


@pytest.fixture
def rtc_delete_fork_client(jp_fetch):
    async def _inner(fork_roomid: str, merge: bool) -> Any:
        return await jp_fetch(
            "/api/collaboration/fork",
            fork_roomid,
            method="DELETE",
            params={"merge": str(merge).lower()},
        )

    return _inner


@pytest.fixture
def rtc_add_doc_to_store(rtc_connect_doc_client):
    event = Event()

    async def _inner(format: str, type: str, path: str) -> None:
        def _on_document_change(target: str, e: Any) -> None:
            expected_target = "cells" if type == "notebook" else "source"
            if target == expected_target:
                event.set()

        if type == "notebook":
            doc = YNotebook()
        else:
            doc = YUnicode()

        doc.observe(_on_document_change)

        websocket, room_name = await rtc_connect_doc_client(format, type, path)
        async with websocket as ws, WebsocketProvider(doc.ydoc, Websocket(ws, room_name)):
            await event.wait()
            await sleep(0.1)

    return _inner


def rtc_create_SQLite_store_factory(jp_serverapp):
    async def _inner(type: str, path: str, content: str) -> DocumentRoom:
        db = SQLiteYStore(
            path=f"{type}:{path}",
            # `SQLiteYStore` here is a subclass of booth `LoggingConfigurable`
            # and `pycrdt_websocket.ystore.SQLiteYStore`, but mypy gets lost:
            config=jp_serverapp.config,  # type:ignore[call-arg]
        )
        _ = create_task(db.start())
        await db.started.wait()

        if type == "notebook":
            doc = YNotebook()
        else:
            doc = YUnicode()

        doc.source = content
        await db.encode_state_as_update(doc.ydoc)

        return db

    return _inner


@pytest.fixture
def rtc_create_SQLite_store(jp_serverapp):
    return rtc_create_SQLite_store_factory(jp_serverapp)


@pytest.fixture
def rtc_create_mock_document_room():
    def _inner(
        id: str,
        path: str,
        content: str,
        last_modified: datetime | None = None,
        save_delay: float | None = None,
        store: SQLiteYStore | None = None,
        writable: bool = True,
    ) -> tuple[FakeContentsManager, FileLoader, DocumentRoom]:
        paths = {id: path}

        if last_modified is None:
            cm = FakeContentsManager({"content": content, "writable": writable})
        else:
            cm = FakeContentsManager(
                {"last_modified": datetime.now(), "content": content, "writable": writable}
            )

        loader = FileLoader(
            id,
            FakeFileIDManager(paths),
            cm,
            poll_interval=0.1,
        )

        return (
            cm,
            loader,
            DocumentRoom(
                "test-room",
                "text",
                "file",
                loader,
                FakeEventLogger(),
                store,
                None,
                save_delay,
            ),
        )

    return _inner
